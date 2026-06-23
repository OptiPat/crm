import type { ScpiLettreMissionPreview } from "@/lib/souscription-cif/render-template";
import type {
  SouscriptionCifDocumentId,
  SouscriptionCifProductType,
} from "@/lib/souscription-cif/souscription-cif-storage";

export type CifPrintDocument = {
  id: SouscriptionCifDocumentId;
  label: string;
  preview: ScpiLettreMissionPreview;
};

/** Ordre d'impression des 4 documents CIF (LM → RTO → RM → annexes). */
export const CIF_PRINT_DOCUMENT_ORDER: readonly SouscriptionCifDocumentId[] = [
  "lettre-mission",
  "convention-rto",
  "rapport-mission",
  "annexes-rapport",
];

/** G3F : pas de convention RTO — LM → RM → annexes. */
export const CIF_PRINT_DOCUMENT_ORDER_G3F: readonly SouscriptionCifDocumentId[] = [
  "lettre-mission",
  "rapport-mission",
  "annexes-rapport",
];

export function cifProductHasConventionRto(productType: SouscriptionCifProductType): boolean {
  return productType !== "g3f";
}

export function getCifPrintDocumentOrder(
  productType: SouscriptionCifProductType
): readonly SouscriptionCifDocumentId[] {
  return cifProductHasConventionRto(productType)
    ? CIF_PRINT_DOCUMENT_ORDER
    : CIF_PRINT_DOCUMENT_ORDER_G3F;
}

export function buildCifPrintBundle(
  previews: Record<SouscriptionCifDocumentId, ScpiLettreMissionPreview>,
  labels: Record<SouscriptionCifDocumentId, string>,
  documentIds: readonly SouscriptionCifDocumentId[] = CIF_PRINT_DOCUMENT_ORDER
): CifPrintDocument[] {
  return documentIds.map((id) => ({
    id,
    label: labels[id],
    preview: previews[id],
  }));
}
