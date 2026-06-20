import type { Document } from "@/lib/api/tauri-documents";

export type DocumentsStatFilter = "patrimoine" | "identite" | "sans_client";

export function isPatrimoineDocument(doc: Pick<Document, "type_document">): boolean {
  return doc.type_document === "PATRIMOINE" || doc.type_document === "QPI";
}

export function isSansClientDocument(doc: Pick<Document, "contact_id">): boolean {
  return doc.contact_id == null;
}

export function computeDocumentsPageStats(documents: Document[]): {
  total: number;
  patrimoine: number;
  identite: number;
  sansClient: number;
} {
  let patrimoine = 0;
  let identite = 0;
  let sansClient = 0;
  for (const doc of documents) {
    if (isPatrimoineDocument(doc)) patrimoine += 1;
    if (doc.type_document === "IDENTITE") identite += 1;
    if (isSansClientDocument(doc)) sansClient += 1;
  }
  return { total: documents.length, patrimoine, identite, sansClient };
}

export function matchesDocumentsStatFilter(
  doc: Document,
  filter: DocumentsStatFilter | null
): boolean {
  if (!filter) return true;
  switch (filter) {
    case "patrimoine":
      return isPatrimoineDocument(doc);
    case "identite":
      return doc.type_document === "IDENTITE";
    case "sans_client":
      return isSansClientDocument(doc);
    default:
      return true;
  }
}
