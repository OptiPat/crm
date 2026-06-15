import type { Contact, NewContact } from "@/lib/api/tauri-contacts";
import type { ExtractedData } from "@/lib/pdf";
import { normalizeEmail } from "@/lib/contacts/duplicate-identity";
import {
  contactNameKey,
  findContactByNameKeyWithSwap,
} from "@/lib/contacts/name-match";

export type RioCoupleMemberExtract = {
  civilite?: string;
  nom?: string;
  prenom?: string;
  email?: string;
  telephone?: string;
  adresse?: string;
  codePostal?: string;
  ville?: string;
  dateNaissance?: string;
  profession?: string;
};

export function toPerson1Extract(data: ExtractedData): RioCoupleMemberExtract {
  return {
    civilite: data.civilite,
    nom: data.nom,
    prenom: data.prenom,
    email: data.email,
    telephone: data.telephone ?? data.telephoneMobile,
    adresse: data.adresse,
    codePostal: data.codePostal,
    ville: data.ville,
    dateNaissance: data.dateNaissance,
    profession: data.profession,
  };
}

export function toPerson2Extract(
  data: ExtractedData
): RioCoupleMemberExtract | null {
  if (!data.conjoint?.nom?.trim() || !data.conjoint.prenom?.trim()) {
    return null;
  }
  const c = data.conjoint;
  return {
    civilite: c.civilite,
    nom: c.nom,
    prenom: c.prenom,
    email: c.email,
    telephone: c.telephone,
    adresse: data.adresse,
    codePostal: data.codePostal,
    ville: data.ville,
    dateNaissance: c.dateNaissance,
    profession: c.profession,
  };
}

export function contactMatchesCoupleMember(
  contact: Contact,
  member: RioCoupleMemberExtract
): boolean {
  const email = member.email?.trim();
  if (email && normalizeEmail(contact.email) === normalizeEmail(email)) {
    return true;
  }
  const nom = member.nom?.trim();
  const prenom = member.prenom?.trim();
  if (!nom || !prenom) return false;
  return (
    contactNameKey(contact.nom, contact.prenom) === contactNameKey(nom, prenom) ||
    contactNameKey(contact.nom, contact.prenom) === contactNameKey(prenom, nom)
  );
}

export function resolveCoupleMemberInContacts(
  member: RioCoupleMemberExtract,
  contacts: Contact[],
  options?: {
    preferredContact?: Contact | null;
    spouseContact?: Contact | null;
    excludeContactId?: number;
  }
): Contact | null {
  const excludeId = options?.excludeContactId;
  const pool = excludeId
    ? contacts.filter((c) => c.id !== excludeId)
    : contacts;

  const preferred = options?.preferredContact;
  if (preferred && contactMatchesCoupleMember(preferred, member)) {
    return preferred;
  }

  const email = member.email?.trim();
  if (email) {
    const normalized = normalizeEmail(email);
    const byEmail = pool.find(
      (c) => normalizeEmail(c.email) === normalized && normalized.length > 0
    );
    if (byEmail) return byEmail;
  }

  const nom = member.nom?.trim();
  const prenom = member.prenom?.trim();
  if (nom && prenom) {
    const byName = findContactByNameKeyWithSwap(pool, nom, prenom);
    if (byName) return byName;
  }

  const spouse = options?.spouseContact;
  if (spouse?.foyer_id && nom && prenom) {
    const foyerPeers = pool.filter(
      (c) => Number(c.foyer_id) === Number(spouse.foyer_id)
    );
    const inFoyer = findContactByNameKeyWithSwap(foyerPeers, nom, prenom);
    if (inFoyer) return inFoyer;
  }

  return null;
}

const CIVILITE_MAP: Record<string, "M" | "MME" | "AUTRE"> = {
  M: "M",
  "M.": "M",
  MONSIEUR: "M",
  MME: "MME",
  MADAME: "MME",
};

const SITUATION_MAP: Record<
  string,
  "CELIBATAIRE" | "MARIE" | "PACSE" | "UNION_LIBRE" | "DIVORCE" | "VEUF" | "AUTRE"
> = {
  CELIBATAIRE: "CELIBATAIRE",
  MARIE: "MARIE",
  MARIÉ: "MARIE",
  MARIEE: "MARIE",
  MARIÉE: "MARIE",
  PACSE: "PACSE",
  PACS: "PACSE",
  PACSÉ: "PACSE",
  PACSEE: "PACSE",
  UNION_LIBRE: "UNION_LIBRE",
  "UNION LIBRE": "UNION_LIBRE",
  CONCUBINAGE: "UNION_LIBRE",
  DIVORCE: "DIVORCE",
  DIVORCÉ: "DIVORCE",
  DIVORCEE: "DIVORCE",
  DIVORCÉE: "DIVORCE",
  VEUF: "VEUF",
  VEUVE: "VEUF",
};

export function parseFrenchDateToIso(dateStr: string): string | undefined {
  const match = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return undefined;
  const [, day, month, year] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

export function mapCoupleMemberToNewContact(
  member: RioCoupleMemberExtract,
  options?: { situationFamiliale?: string }
): NewContact {
  const contact: NewContact = {
    nom: member.nom?.trim() || "",
    prenom: member.prenom?.trim() || "",
    categorie: "SUSPECT_CLIENT",
    statut_suivi: "ACTIF",
  };

  if (member.civilite) {
    contact.civilite = CIVILITE_MAP[member.civilite.toUpperCase()] || "AUTRE";
  }
  if (member.email?.trim()) contact.email = member.email.trim();
  if (member.telephone?.trim()) contact.telephone = member.telephone.trim();
  if (member.adresse?.trim()) contact.adresse = member.adresse.trim();
  if (member.codePostal?.trim()) contact.code_postal = member.codePostal.trim();
  if (member.ville?.trim()) contact.ville = member.ville.trim();
  if (member.profession?.trim()) contact.profession = member.profession.trim();

  if (member.dateNaissance) {
    const iso = parseFrenchDateToIso(member.dateNaissance);
    if (iso) contact.date_naissance = iso;
  }

  if (options?.situationFamiliale) {
    contact.situation_familiale =
      SITUATION_MAP[options.situationFamiliale.toUpperCase()] || "AUTRE";
  }

  return contact;
}

export function pickPreferredContactForCouple(
  preferredContact: Contact | null | undefined,
  person1: RioCoupleMemberExtract,
  person2: RioCoupleMemberExtract
): { person1Preferred?: Contact; person2Preferred?: Contact } {
  if (!preferredContact) return {};
  if (contactMatchesCoupleMember(preferredContact, person1)) {
    return { person1Preferred: preferredContact };
  }
  if (contactMatchesCoupleMember(preferredContact, person2)) {
    return { person2Preferred: preferredContact };
  }
  return {};
}

export function buildCoupleApplySummary(parts: {
  person1: Contact;
  person2: Contact;
  person1Created: boolean;
  person2Created: boolean;
}): string {
  const line = (contact: Contact, created: boolean) =>
    created
      ? `✅ Créé : ${contact.prenom} ${contact.nom}`
      : `✅ Mis à jour : ${contact.prenom} ${contact.nom}`;

  return [line(parts.person1, parts.person1Created), line(parts.person2, parts.person2Created)].join(
    "\n"
  );
}
