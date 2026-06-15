import {
  ANNEXES_SCPI_PAGE1_BODY_AFTER_SECTION,
  ANNEXES_SCPI_PAGE1_BODY_BEFORE_SECTION,
  ANNEXES_SCPI_PRODUCT_SECTION_TITLE,
  ANNEXES_SCPI_RENDEMENT_AMF_RISK_LEVEL,
  ANNEXES_SCPI_RENDEMENT_HORIZON_PLACEMENT,
} from "@/lib/souscription-cif/annexes-rapport-scpi-page1";
import { ANNEXES_SCPI_PAGE2_BODY } from "@/lib/souscription-cif/annexes-rapport-scpi-page2";
import {
  ANNEXES_SCPI_PAGE2_SECTION4_INTRO,
  ANNEXES_SCPI_PROS_CONS_FISCAL_ROWS,
} from "@/lib/souscription-cif/annexes-scpi-pros-cons-table";
import {
  ANNEXES_SCPI_PAGE3_RISKS_BODY,
  ANNEXES_SCPI_PAGE3_SECTION42_TITLE,
} from "@/lib/souscription-cif/annexes-rapport-scpi-page3";
import { ANNEXES_SCPI_PAGE4_INTRO } from "@/lib/souscription-cif/annexes-rapport-scpi-page4";
import {
  ANNEXES_SCPI_COSTS_FOOTER,
  ANNEXES_SCPI_COSTS_INTRO,
} from "@/lib/souscription-cif/annexes-scpi-costs-table";
import { ANNEXES_SCPI_PAGE5_TABLE_HEADER } from "@/lib/souscription-cif/annexes-rapport-scpi-page5";
import { ANNEXES_SCPI_RECAP_ROW_TEMPLATES } from "@/lib/souscription-cif/annexes-scpi-recap-table";
import { buildAnnexesScpiCostsRows } from "@/lib/souscription-cif/build-annexes-scpi-costs";
import { ANNEXES_RAPPORT_DOCUMENT_TITLE } from "@/lib/souscription-cif/cif-documents";
import type { SouscriptionDossierFields } from "@/lib/souscription-cif/dossier-fields";
import { SCPI_LM_PAGE1_FOOTER_DEFAULT } from "@/lib/souscription-cif/scpi-lettre-mission-page1";
import {
  buildCifDocumentFooterSegments,
  collectMissingFromPage,
  renderTemplateSegments,
  type ScpiLettreMissionPreview,
  type ScpiLmPagePreview,
} from "@/lib/souscription-cif/render-template";
import type { SouscriptionCifProductType } from "@/lib/souscription-cif/souscription-cif-storage";

export function buildAnnexesRapportPreview(
  productType: SouscriptionCifProductType,
  variables: Record<string, string | null>,
  dossier: SouscriptionDossierFields,
  footerOverride?: string | null
): ScpiLettreMissionPreview {
  if (productType !== "scpi") {
    return { pages: [], missingKeys: [] };
  }

  const footerSegments = buildCifDocumentFooterSegments(variables, footerOverride);

  const page1: ScpiLmPagePreview = {
    pageNumber: 1,
    title: ANNEXES_RAPPORT_DOCUMENT_TITLE,
    bodySegments: renderTemplateSegments(ANNEXES_SCPI_PAGE1_BODY_BEFORE_SECTION, variables),
    centeredSectionTitle: ANNEXES_SCPI_PRODUCT_SECTION_TITLE,
    bodySegmentsContinuation: renderTemplateSegments(
      ANNEXES_SCPI_PAGE1_BODY_AFTER_SECTION,
      variables
    ),
    showAmfRiskScale: true,
    amfRiskHighlightLevel: ANNEXES_SCPI_RENDEMENT_AMF_RISK_LEVEL,
    amfRiskInvestmentHorizon: ANNEXES_SCPI_RENDEMENT_HORIZON_PLACEMENT,
    footerSegments,
  };

  const missing = new Set<string>(collectMissingFromPage(page1));

  const page2: ScpiLmPagePreview = {
    pageNumber: 2,
    bodySegments: renderTemplateSegments(ANNEXES_SCPI_PAGE2_BODY, variables),
    bodySegmentsAfterTable: renderTemplateSegments(ANNEXES_SCPI_PAGE2_SECTION4_INTRO, variables),
    showAnnexesProsConsTable: true,
    footerSegments,
  };
  collectMissingFromPage(page2).forEach((k) => missing.add(k));

  const page3: ScpiLmPagePreview = {
    pageNumber: 3,
    bodySegments: renderTemplateSegments(ANNEXES_SCPI_PAGE3_SECTION42_TITLE, variables),
    showAnnexesProsConsTable: true,
    annexesProsConsRows: ANNEXES_SCPI_PROS_CONS_FISCAL_ROWS,
    bodySegmentsAfterProsConsTable: renderTemplateSegments(ANNEXES_SCPI_PAGE3_RISKS_BODY, variables),
    footerSegments,
  };
  collectMissingFromPage(page3).forEach((k) => missing.add(k));

  const page4: ScpiLmPagePreview = {
    pageNumber: 4,
    bodySegments: renderTemplateSegments(ANNEXES_SCPI_PAGE4_INTRO, variables),
    footerSegments,
  };
  collectMissingFromPage(page4).forEach((k) => missing.add(k));

  const page5: ScpiLmPagePreview = {
    pageNumber: 5,
    bodySegments: [],
    rapportRecapTableHeader: ANNEXES_SCPI_PAGE5_TABLE_HEADER,
    rapportRecapRows: ANNEXES_SCPI_RECAP_ROW_TEMPLATES.map((row) => ({
      title: row.title,
      contentSegments: renderTemplateSegments(row.contentTemplate, variables),
    })),
    bodySegmentsAfterRecapTable: renderTemplateSegments(ANNEXES_SCPI_COSTS_INTRO, variables),
    showAnnexesCostsTable: true,
    annexesCostsRows: buildAnnexesScpiCostsRows(dossier),
    bodySegmentsAfterCostsTable: renderTemplateSegments(ANNEXES_SCPI_COSTS_FOOTER, variables),
    footerSegments,
  };
  collectMissingFromPage(page5).forEach((k) => missing.add(k));

  return {
    pages: [page1, page2, page3, page4, page5],
    missingKeys: [...missing],
  };
}

export { SCPI_LM_PAGE1_FOOTER_DEFAULT as ANNEXES_RAPPORT_FOOTER_DEFAULT };
