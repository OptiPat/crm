import type { ExtractedData } from "@/lib/pdf";
import {
  getContactById,
  updateContact,
} from "@/lib/api/tauri-contacts";
import { contactToUpdatePayload } from "@/lib/contacts/contact-form-utils";
import {
  buildCoupleMemberRioFinancialFields,
  buildSoloRioFinancialContactFields,
  mergeRioFieldsOntoContact,
} from "@/lib/contacts/rio-contact-fields";

export async function applyRioFinancialFieldsToContact(
  contactId: number,
  data: ExtractedData
): Promise<void> {
  const existing = await getContactById(contactId);
  const financial = buildSoloRioFinancialContactFields(data);
  if (Object.keys(financial).length === 0) return;
  await updateContact(
    contactId,
    contactToUpdatePayload(existing, mergeRioFieldsOntoContact(existing, financial))
  );
}

export async function applyRioFinancialFieldsToCouple(
  memberContactIds: [number, number],
  data: ExtractedData
): Promise<void> {
  for (const [index, contactId] of memberContactIds.entries()) {
    const member = index === 0 ? "person1" : "person2";
    const existing = await getContactById(contactId);
    const financial = buildCoupleMemberRioFinancialFields(data, member);
    if (Object.keys(financial).length === 0) continue;
    await updateContact(
      contactId,
      contactToUpdatePayload(existing, mergeRioFieldsOntoContact(existing, financial))
    );
  }
}

export async function applyRioFinancialFields(
  data: ExtractedData,
  contactIds: number[]
): Promise<void> {
  if (data.isCouple && contactIds.length >= 2) {
    await applyRioFinancialFieldsToCouple([contactIds[0], contactIds[1]], data);
    return;
  }
  if (contactIds[0]) {
    await applyRioFinancialFieldsToContact(contactIds[0], data);
  }
}
