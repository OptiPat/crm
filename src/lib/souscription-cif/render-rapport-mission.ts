import {
  RM_DOCUMENT_TITLE,
  RM_PAGE1_BODY_AFTER_TITLE,
} from "@/lib/souscription-cif/rapport-mission-page1";
import {
  RM_PAGE2_FAIT_A,
  RM_PAGE2_RECAP_ROW_TEMPLATES,
  RM_PAGE2_SIGNATURE_LEFT,
  RM_PAGE2_SIGNATURE_RIGHT,
} from "@/lib/souscription-cif/rapport-mission-page2";
import {
  RM_RECAP_ROW_DEMANDE_TITLE,
  RM_RECAP_ROW_SITUATION_TITLE,
  RM_RECAP_SITUATION_INTRO,
} from "@/lib/souscription-cif/rapport-mission-recap-table";
import { SCPI_LM_PAGE1_FOOTER_DEFAULT } from "@/lib/souscription-cif/scpi-lettre-mission-page1";
import {
  buildCifDocumentClientHeader,
  buildCifDocumentFooterSegments,
  collectMissingFromPage,
  renderTemplateLines,
  renderTemplateSegments,
  type ScpiLettreMissionPreview,
  type ScpiLmPagePreview,
} from "@/lib/souscription-cif/render-template";

export function buildRapportMissionPreview(
  variables: Record<string, string | null>,
  footerOverride?: string | null
): ScpiLettreMissionPreview {
  const footerSegments = buildCifDocumentFooterSegments(variables, footerOverride);

  const situationIntroAndBullets = renderTemplateSegments(
    `${RM_RECAP_SITUATION_INTRO}\n\n{{rappel_situation_client}}`,
    variables
  );

  const page1: ScpiLmPagePreview = {
    pageNumber: 1,
    ...buildCifDocumentClientHeader(variables),
    title: RM_DOCUMENT_TITLE,
    bodySegments: renderTemplateSegments(RM_PAGE1_BODY_AFTER_TITLE, variables),
    rapportRecapRows: [
      {
        title: RM_RECAP_ROW_DEMANDE_TITLE,
        contentSegments: renderTemplateSegments("{{rappel_demande}}", variables),
      },
      {
        title: RM_RECAP_ROW_SITUATION_TITLE,
        contentSegments: situationIntroAndBullets,
      },
    ],
    footerSegments,
  };

  const page2: ScpiLmPagePreview = {
    pageNumber: 2,
    bodySegments: [],
    rapportRecapRows: RM_PAGE2_RECAP_ROW_TEMPLATES.map((row) => ({
      title: row.title,
      contentSegments: renderTemplateSegments(row.contentTemplate, variables),
    })),
    bodySegmentsAfterTable: renderTemplateSegments(RM_PAGE2_FAIT_A, variables),
    signatureColumns: {
      left: renderTemplateLines(RM_PAGE2_SIGNATURE_LEFT, variables),
      right: renderTemplateLines(RM_PAGE2_SIGNATURE_RIGHT, variables),
    },
    footerSegments,
  };

  const missing = new Set<string>([
    ...collectMissingFromPage(page1),
    ...collectMissingFromPage(page2),
  ]);

  return {
    pages: [page1, page2],
    missingKeys: [...missing],
  };
}
export { SCPI_LM_PAGE1_FOOTER_DEFAULT as RM_FOOTER_DEFAULT };
