import type {
  ScpiLettreMissionPreview,
  ScpiLmPagePreview,
} from "@/lib/souscription-cif/render-template";

/**
 * Convertit un aperçu multi-pages en sections de flux continu pour Paged.js.
 *
 * Le découpage en pages A4 est délégué au navigateur ; ici on ne garde que les
 * coupures *logiques* (une section = un saut de page dur). Les pages consécutives
 * qui ne sont que la suite d'un même tableau récapitulatif (cas Rapport de mission
 * pages 2 + 3) sont fusionnées en UNE section : le tableau devient une seule table
 * que le navigateur fragmente proprement, sans ligne orpheline ni grand blanc.
 */
export function buildCifFlowSections(
  preview: ScpiLettreMissionPreview
): ScpiLmPagePreview[] {
  const sections: ScpiLmPagePreview[] = [];

  for (const page of preview.pages) {
    const prev = sections[sections.length - 1];
    if (prev && isRecapContinuation(prev, page)) {
      prev.rapportRecapRows = [
        ...(prev.rapportRecapRows ?? []),
        ...(page.rapportRecapRows ?? []),
      ];
      prev.rapportRecapTableHeader =
        prev.rapportRecapTableHeader ?? page.rapportRecapTableHeader;
      prev.bodySegmentsAfterRecapTable = page.bodySegmentsAfterRecapTable;
      prev.showAnnexesCostsTable = page.showAnnexesCostsTable;
      prev.annexesCostsRows = page.annexesCostsRows;
      prev.bodySegmentsAfterCostsTable = page.bodySegmentsAfterCostsTable;
      prev.signatureColumns = page.signatureColumns;
      continue;
    }
    sections.push({ ...page });
  }

  return sections.map((section, index) => ({ ...section, pageNumber: index + 1 }));
}

/**
 * Empreinte du contenu d'un aperçu : change dès que le moindre contenu évolue
 * (texte, lignes de tableau, montants de coûts, cases, profil…), pour déclencher
 * une re-pagination Paged.js — et éviter un aperçu obsolète. La sérialisation
 * complète est sûre : les documents CIF sont petits (quelques pages).
 */
export function cifFlowFingerprint(preview: ScpiLettreMissionPreview): string {
  return JSON.stringify(preview.pages);
}

/** Une page est la suite d'un tableau récap si elle ne contient QUE des lignes récap. */
function isRecapContinuation(
  prev: ScpiLmPagePreview,
  page: ScpiLmPagePreview
): boolean {
  return Boolean(
    prev.rapportRecapRows?.length &&
      page.rapportRecapRows?.length &&
      !page.title &&
      !page.headerLeft &&
      !page.centeredSectionTitle &&
      !page.centeredPreambleTitle &&
      page.bodySegments.length === 0 &&
      !prev.bodySegmentsAfterRecapTable &&
      !prev.signatureColumns &&
      !prev.showAnnexesCostsTable
  );
}
