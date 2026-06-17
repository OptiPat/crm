import type { Document } from "@/lib/api/tauri-documents";
import type { SouscriptionDossierFields } from "@/lib/souscription-cif/dossier-fields";

/** Dernier document d'un type avec `date_document` (ISO YYYY-MM-DD). */
export function latestDocumentDateIso(
  documents: readonly Document[],
  typeDocument: string
): string | undefined {
  let best: Document | undefined;
  for (const doc of documents) {
    if (doc.type_document !== typeDocument) continue;
    const iso = doc.date_document?.trim();
    if (!iso) continue;
    if (!best || doc.created_at > best.created_at) {
      best = doc;
    }
  }
  return best?.date_document?.trim();
}

/** Préremplit dateRio / dateQpi depuis les PDF importés (PATRIMOINE / QPI). */
export function dossierDatePatchFromDocuments(
  existing: Pick<SouscriptionDossierFields, "dateRio" | "dateQpi">,
  documents: readonly Document[]
): Partial<Pick<SouscriptionDossierFields, "dateRio" | "dateQpi">> {
  const patch: Partial<Pick<SouscriptionDossierFields, "dateRio" | "dateQpi">> = {};

  if (!existing.dateRio?.trim()) {
    const dateRio = latestDocumentDateIso(documents, "PATRIMOINE");
    if (dateRio) patch.dateRio = dateRio;
  }

  if (!existing.dateQpi?.trim()) {
    const dateQpi = latestDocumentDateIso(documents, "QPI");
    if (dateQpi) patch.dateQpi = dateQpi;
  }

  return patch;
}
