import { getDocumentsByContact, type Document } from "@/lib/api/tauri-documents";

export async function loadPipeChecklistDocumentsForContacts(
  contactId: number,
  secondaryContactId?: number | null
): Promise<Document[]> {
  const contactIds = [contactId];
  if (
    secondaryContactId != null &&
    secondaryContactId > 0 &&
    secondaryContactId !== contactId
  ) {
    contactIds.push(secondaryContactId);
  }

  const docArrays = await Promise.all(contactIds.map((id) => getDocumentsByContact(id)));
  const byId = new Map<number, Document>();
  for (const doc of docArrays.flat()) {
    byId.set(doc.id, doc);
  }
  return [...byId.values()];
}

export function mergePipeChecklistDocument(
  documents: Document[],
  imported: Document
): Document[] {
  const byId = new Map(documents.map((doc) => [doc.id, doc]));
  byId.set(imported.id, imported);
  return [...byId.values()];
}
