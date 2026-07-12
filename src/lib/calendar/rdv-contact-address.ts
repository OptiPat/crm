import { getContactById, updateContact, type Contact } from "@/lib/api/tauri-contacts";
import type { ContactAddressFields } from "@/lib/contacts/contact-form-utils";
import { contactToUpdatePayload, isContactAddressEmpty } from "@/lib/contacts/contact-form-utils";
import { notifyContactsChanged } from "@/lib/contacts/contact-events";

export function contactAddressFromContact(
  contact: Pick<Contact, "adresse" | "code_postal" | "ville" | "pays">
): ContactAddressFields {
  return {
    adresse: contact.adresse || "",
    code_postal: contact.code_postal || "",
    ville: contact.ville || "",
    pays: contact.pays || "",
  };
}

export function formatContactAddressForCalendar(fields: ContactAddressFields): string | null {
  const adresse = fields.adresse?.trim() ?? "";
  const codePostal = fields.code_postal?.trim() ?? "";
  const ville = fields.ville?.trim() ?? "";
  const pays = fields.pays?.trim() ?? "";

  const cityLine = [codePostal, ville].filter(Boolean).join(" ").trim();
  const parts = [adresse, cityLine, pays && pays !== "France" ? pays : ""].filter(Boolean);
  const formatted = parts.join(", ").trim();
  return formatted || null;
}

export function contactAddressFieldsChanged(
  contact: Contact,
  draft: ContactAddressFields
): boolean {
  return (
    (contact.adresse || "") !== (draft.adresse || "") ||
    (contact.code_postal || "") !== (draft.code_postal || "") ||
    (contact.ville || "") !== (draft.ville || "") ||
    (contact.pays || "") !== (draft.pays || "")
  );
}

export async function persistRdvContactAddress(
  contactId: number,
  draft: ContactAddressFields
): Promise<void> {
  if (contactId <= 0) return;
  const contact = await getContactById(contactId);
  if (!contactAddressFieldsChanged(contact, draft)) return;
  await updateContact(
    contactId,
    contactToUpdatePayload(contact, {
      adresse: draft.adresse?.trim() || undefined,
      code_postal: draft.code_postal?.trim() || undefined,
      ville: draft.ville?.trim() || undefined,
      pays: draft.pays?.trim() || undefined,
    })
  );
  notifyContactsChanged();
}

export function validatePresentielAddress(fields: ContactAddressFields): string | null {
  if (isContactAddressEmpty(fields)) {
    return "Indiquez l'adresse du RDV (rue, code postal et ville).";
  }
  if (!fields.adresse?.trim()) {
    return "L'adresse est requise pour un RDV en présentiel.";
  }
  if (!fields.ville?.trim()) {
    return "La ville est requise pour un RDV en présentiel.";
  }
  return null;
}
