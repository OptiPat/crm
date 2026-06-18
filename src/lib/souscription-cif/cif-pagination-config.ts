import type { SouscriptionCifDocumentId } from "@/lib/souscription-cif/souscription-cif-storage";

/** Documents paginés nativement (flux continu + Paged.js) plutôt qu'à pages figées. */
const PAGINATED_DOCUMENTS: ReadonlySet<SouscriptionCifDocumentId> = new Set([
  "rapport-mission",
  "annexes-rapport",
]);

export function cifDocumentUsesPagination(documentId: SouscriptionCifDocumentId): boolean {
  return PAGINATED_DOCUMENTS.has(documentId);
}
