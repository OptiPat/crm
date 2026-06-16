import {
  createContact,
  getContactsByFoyer,
  updateContact,
  type Contact,
} from "@/lib/api/tauri-contacts";
import { unixToDateInput } from "@/lib/dates/calendar-date";
import { contactToUpdatePayload } from "@/lib/contacts/contact-form-utils";
import { parseFrenchDateToIso } from "@/lib/contacts/rio-couple-import";
import type { ExtractedData } from "@/lib/pdf";

const DECLARANT_ROLES = new Set(["DECLARANT_1", "DECLARANT_2"]);

function isEnfantMatchCandidate(contact: Contact): boolean {
  if (!contact.role_foyer) return true;
  if (contact.role_foyer === "ENFANT") return true;
  if (DECLARANT_ROLES.has(contact.role_foyer)) return false;
  return contact.role_foyer === "AUTRE";
}

function enfantMatches(
  contact: Contact,
  enfant: NonNullable<ExtractedData["enfants"]>[number]
): boolean {
  if (!isEnfantMatchCandidate(contact)) return false;

  const prenom = enfant.prenom?.trim().toLowerCase();
  const nom = enfant.nom?.trim().toLowerCase();
  if (!prenom || !nom) return false;
  if (contact.prenom.trim().toLowerCase() !== prenom) return false;
  if (contact.nom.trim().toLowerCase() !== nom) return false;

  if (enfant.dateNaissance && contact.date_naissance) {
    const iso = parseFrenchDateToIso(enfant.dateNaissance);
    if (iso) {
      return unixToDateInput(contact.date_naissance) === iso.slice(0, 10);
    }
  }

  return contact.role_foyer === "ENFANT" || !contact.role_foyer;
}

export async function syncRioEnfants(options: {
  enfants?: ExtractedData["enfants"];
  foyerId: number;
}): Promise<number> {
  const enfants = options.enfants?.filter(
    (e) => e.prenom?.trim() && e.nom?.trim()
  );
  if (!enfants?.length) return 0;

  let foyerMembers = await getContactsByFoyer(options.foyerId);
  let synced = 0;

  for (const enfant of enfants) {
    const existing = foyerMembers.find((c) => enfantMatches(c, enfant));
    const dateIso = enfant.dateNaissance
      ? parseFrenchDateToIso(enfant.dateNaissance)
      : undefined;

    if (existing?.id) {
      await updateContact(
        existing.id,
        contactToUpdatePayload(existing, {
          nom: enfant.nom!.trim(),
          prenom: enfant.prenom!.trim(),
          ...(dateIso ? { date_naissance: dateIso } : {}),
          role_foyer: "ENFANT",
          foyer_id: options.foyerId,
        })
      );
    } else {
      const created = await createContact({
        nom: enfant.nom!.trim(),
        prenom: enfant.prenom!.trim(),
        categorie: "SUSPECT_CLIENT",
        statut_suivi: "ACTIF",
        date_naissance: dateIso,
        role_foyer: "ENFANT",
        foyer_id: options.foyerId,
      });
      foyerMembers = [...foyerMembers, created];
    }
    synced += 1;
  }

  return synced;
}
