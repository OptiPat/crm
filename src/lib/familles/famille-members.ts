import { updateContact, type Contact } from "@/lib/api/tauri-contacts";
import { createFamille, deleteFamille } from "@/lib/api/tauri-familles";
import { contactToUpdatePayload } from "@/lib/contacts/contact-form-utils";
import { notifyContactsChanged } from "@/lib/contacts/contact-events";

export async function createFamilleWithMembers(
  nom: string,
  memberIds: number[],
  contactsById: Map<number, Contact>
): Promise<number> {
  const famille = await createFamille({ nom: nom.trim() });
  await Promise.all(
    memberIds.map((id) => {
      const contact = contactsById.get(id);
      if (!contact) return Promise.resolve();
      return updateContact(
        id,
        contactToUpdatePayload(contact, { famille_id: famille.id })
      );
    })
  );
  notifyContactsChanged();
  return famille.id;
}

export async function addContactToFamille(
  contact: Contact,
  familleId: number
): Promise<void> {
  if (!contact.id) return;
  await updateContact(
    contact.id,
    contactToUpdatePayload(contact, { famille_id: familleId })
  );
  notifyContactsChanged();
}

export async function removeContactFromFamille(contact: Contact): Promise<void> {
  if (!contact.id) return;
  const familleId = contact.famille_id;
  await updateContact(
    contact.id,
    contactToUpdatePayload(contact, { famille_id: null })
  );
  notifyContactsChanged();
  if (familleId != null) {
    // Nettoyage best-effort si la famille n'a plus de membres (géré côté page après reload).
  }
}

export async function deleteFamilleIfEmpty(
  familleId: number,
  contacts: Contact[]
): Promise<void> {
  const stillLinked = contacts.some((c) => c.famille_id === familleId);
  if (!stillLinked) {
    await deleteFamille(familleId);
  }
}
