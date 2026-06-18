import type { ScpiLettreMissionPreview } from "@/lib/souscription-cif/render-template";
import type { SouscriptionCifDocumentId } from "@/lib/souscription-cif/souscription-cif-storage";

const PAGINATED_DOCUMENTS: ReadonlySet<SouscriptionCifDocumentId> = new Set([
  "rapport-mission",
  "annexes-rapport",
]);

export function cifDocumentUsesPagination(documentId: SouscriptionCifDocumentId): boolean {
  return PAGINATED_DOCUMENTS.has(documentId);
}

export function pickPreviewForDocument(
  documentId: SouscriptionCifDocumentId,
  raw: ScpiLettreMissionPreview,
  paginated: Partial<Record<SouscriptionCifDocumentId, ScpiLettreMissionPreview>>
): ScpiLettreMissionPreview {
  if (cifDocumentUsesPagination(documentId)) {
    return paginated[documentId] ?? raw;
  }
  return raw;
}
