import { updateContact, getContactsByFoyer, type Contact } from "@/lib/api/tauri-contacts";
import type { Foyer } from "@/lib/api/tauri-foyers";
import {
  contactToUpdatePayload,
  isContactAddressEmpty,
  pickFoyerMemberAddress,
} from "@/lib/contacts/contact-form-utils";
import {
  getInvestissementsByContact,
  getInvestissementsByFoyer,
  type Investissement,
} from "@/lib/api/tauri-investissements";

export function getContactsForFoyer(
  contacts: Contact[],
  foyerId: number
): Contact[] {
  return contacts.filter(
    (c) => c.foyer_id != null && Number(c.foyer_id) === Number(foyerId)
  );
}

/** Rattache un contact à un foyer (payload complet, dates ISO). */
export async function linkContactToFoyer(
  contact: Contact,
  foyerId: number,
  roleFoyer: string,
  options?: { skipPostSaveHooks?: boolean }
): Promise<Contact> {
  if (!contact.id) {
    throw new Error("Contact invalide");
  }

  const payloadOverrides: Parameters<typeof contactToUpdatePayload>[1] = {
    foyer_id: foyerId,
    role_foyer: roleFoyer,
  };

  if (isContactAddressEmpty(contact)) {
    const members = await getContactsByFoyer(foyerId);
    const picked = pickFoyerMemberAddress(members, foyerId, contact.id);
    if (picked) {
      payloadOverrides.adresse = picked.adresse;
      payloadOverrides.code_postal = picked.code_postal;
      payloadOverrides.ville = picked.ville;
      payloadOverrides.pays = picked.pays;
    }
  }

  return updateContact(
    contact.id,
    contactToUpdatePayload(contact, payloadOverrides),
    options
  );
}

/** Rôle du contact dans le foyer (déclarant, enfant…). */
export const FOYER_ROLE_OPTIONS = [
  { value: "DECLARANT_1", label: "Déclarant 1" },
  { value: "DECLARANT_2", label: "Déclarant 2" },
  { value: "ENFANT", label: "Enfant" },
  { value: "AUTRE", label: "Autre membre" },
] as const;

export async function updateContactFoyerRole(
  contact: Contact,
  roleFoyer: string
): Promise<Contact> {
  if (!contact.id) throw new Error("Contact invalide");
  return updateContact(
    contact.id,
    contactToUpdatePayload(contact, { role_foyer: roleFoyer })
  );
}

export async function dissociateContactFromFoyer(contact: Contact): Promise<Contact> {
  if (!contact.id) throw new Error("Contact invalide");
  return updateContact(
    contact.id,
    contactToUpdatePayload(contact, { foyer_id: null, role_foyer: null })
  );
}

/** Membres du foyer avec le rôle « Enfant » (RIO / fiche contact). */
export function getEnfantsFoyer(members: readonly Contact[]): Contact[] {
  return members.filter((c) => c.role_foyer === "ENFANT");
}

export function countEnfantsFoyer(members: readonly Contact[]): number {
  return getEnfantsFoyer(members).length;
}

/** Nombre d'enfants pertinent pour un contact (0 si le contact est lui-même enfant du foyer). */
export function resolveNombreEnfantsForContact(
  contact: Pick<Contact, "role_foyer"> | null,
  members: readonly Contact[]
): number {
  if (contact?.role_foyer === "ENFANT") return 0;
  return countEnfantsFoyer(members);
}

/** Tous les membres du foyer incluant le contact courant (sans doublon). */
export function mergeFoyerMembers(
  contact: Contact,
  otherMembers: readonly Contact[]
): Contact[] {
  const others = otherMembers.filter((m) => m.id !== contact.id);
  return [contact, ...others];
}

const ROLE_FOYER_LABELS: Record<string, string> = {
  DECLARANT_1: "Déclarant 1",
  DECLARANT_2: "Déclarant 2",
  ENFANT: "Enfant",
  AUTRE: "Autre",
};

export function formatFoyerMemberLabel(
  contact: Contact,
  role?: string | null
): string {
  const name = `${contact.prenom} ${contact.nom}`.trim();
  if (!role) return name;
  return `${name} · ${ROLE_FOYER_LABELS[role] || role}`;
}

/** Nom de foyer suggéré à partir des noms de famille des membres. */
export function buildFoyerNomFromMembers(contacts: Contact[]): string {
  const uniqueNoms = [
    ...new Set(
      contacts.map((c) => c.nom.trim().toUpperCase()).filter(Boolean)
    ),
  ].sort();
  if (uniqueNoms.length === 0) return "Foyer";
  if (uniqueNoms.length === 1) return `Foyer ${uniqueNoms[0]}`;
  return `Foyer ${uniqueNoms.join(" - ")}`;
}

/** Foyer existant pour un nom de famille (évite les doublons à l'import). */
export function findExistingFoyerByFamilleName(
  foyers: Foyer[],
  nomFamilleCompose: string
): Foyer | undefined {
  const famille = nomFamilleCompose.trim().toUpperCase();
  if (!famille) return undefined;

  const targetNom = `Foyer ${nomFamilleCompose.trim()}`.toUpperCase();
  const exact = foyers.find((f) => f.nom.trim().toUpperCase() === targetNom);
  if (exact) return exact;

  return foyers.find((f) => {
    const bare = f.nom.replace(/^(Foyer|Famille)\s+/i, "").trim().toUpperCase();
    return bare === famille;
  });
}

export type FoyerInvestissement = Investissement & {
  proprietaireLabel: string;
};

/** Investissements du foyer : communs (foyer_id) + individuels des membres, sans doublon. */
export async function loadFoyerInvestissements(
  foyerId: number,
  membres: Contact[]
): Promise<FoyerInvestissement[]> {
  const byId = new Map<number, FoyerInvestissement>();

  const foyerInvs = await getInvestissementsByFoyer(foyerId);
  for (const inv of foyerInvs) {
    byId.set(inv.id, { ...inv, proprietaireLabel: "Commun (foyer)" });
  }

  for (const member of membres) {
    if (!member.id) continue;
    const invs = await getInvestissementsByContact(member.id);
    const label = `${member.prenom} ${member.nom}`.trim() || "Membre";
    for (const inv of invs) {
      if (!byId.has(inv.id)) {
        byId.set(inv.id, { ...inv, proprietaireLabel: label });
      }
    }
  }

  return Array.from(byId.values()).sort(
    (a, b) => (b.date_souscription ?? 0) - (a.date_souscription ?? 0)
  );
}

export function sumPatrimoineCentimes(
  investissements: Pick<Investissement, "montant_initial" | "origine">[],
  options?: { avecMoiOnly?: boolean }
): number {
  const list = options?.avecMoiOnly
    ? investissements.filter((i) => i.origine === "MON_CONSEIL")
    : investissements;
  return list.reduce((sum, inv) => sum + (inv.montant_initial || 0), 0);
}

/** Patrimoine foyer (communs + membres), en centimes. */
export async function loadFoyerPatrimoineCentimes(
  foyerId: number,
  membres: Contact[],
  options?: { avecMoiOnly?: boolean }
): Promise<number> {
  const invs = await loadFoyerInvestissements(foyerId, membres);
  return sumPatrimoineCentimes(invs, options);
}
