import { getContactById, updateContact, type NewContact } from "@/lib/api/tauri-contacts";
import {
  contactToUpdatePayload,
  isClientActif,
  isFilleulStatut,
} from "@/lib/contacts/contact-form-utils";

/** Met à jour la date de dernier contact client et/ou filleul après une interaction. */
export async function touchContactAfterInteraction(
  contactId: number,
  dateIso: string
): Promise<void> {
  const contact = await getContactById(contactId);
  const clientActif = isClientActif(contact.categorie);
  const filleulActif = isFilleulStatut(contact.filleul_categorie);

  const overrides: Partial<NewContact> = {};
  if (clientActif) {
    overrides.date_dernier_contact = dateIso;
  }
  if (filleulActif) {
    overrides.date_dernier_contact_filleul = dateIso;
  }
  if (!clientActif && !filleulActif) {
    overrides.date_dernier_contact = dateIso;
  }

  await updateContact(contactId, contactToUpdatePayload(contact, overrides));
}
