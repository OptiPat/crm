import type { Contact } from "@/lib/api/tauri-contacts";

/** Le contact chargé correspond bien au sélecteur (évite contamination inter-clients). */
export function isContactSelectionReady(
  contactId: number | undefined,
  contact: Contact | null
): contact is Contact {
  return contactId != null && contact != null && contact.id === contactId;
}

export function getReadyContactSelection(
  contactId: number | undefined,
  contact: Contact | null
): { contactId: number; contact: Contact } | null {
  if (!isContactSelectionReady(contactId, contact)) return null;
  return { contactId: contact.id, contact };
}

export function lieuNaissanceFromContact(contact: Contact | null): string {
  return contact?.lieu_naissance?.trim() ?? "";
}
