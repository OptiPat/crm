import { ANNEXES_CAPITAL_INVEST_PRECONISATIONS_BODY } from "@/lib/souscription-cif/annexes-rapport-capital-invest-preconisations";
import {
  ANNEXES_CAPITAL_INVEST_RECAP_TABLE_HEADER,
  buildAnnexesCapitalInvestRecapRows,
} from "@/lib/souscription-cif/annexes-capital-invest-recap-table";
import {
  ANNEXES_CAPITAL_INVEST_BODY_AFTER_DIAGRAM,
  ANNEXES_CAPITAL_INVEST_BODY_AFTER_FISCALITE_TABLE,
  ANNEXES_CAPITAL_INVEST_BEFORE_FISCALITE_TABLE,
  ANNEXES_CAPITAL_INVEST_PAGE1_BODY_AFTER_SECTION,
  ANNEXES_CAPITAL_INVEST_PAGE1_BODY_BEFORE_SECTION,
  ANNEXES_CAPITAL_INVEST_PRODUCT_SECTION_TITLE,
} from "@/lib/souscription-cif/annexes-rapport-capital-invest-page1";
import {
  ANNEXES_CAPITAL_INVEST_PROS_CONS_ROWS,
  ANNEXES_CAPITAL_INVEST_SECTION32_SORTIE,
  ANNEXES_CAPITAL_INVEST_SECTION4_INTRO,
  ANNEXES_CAPITAL_INVEST_AMF_RISK_LEVEL,
  ANNEXES_CAPITAL_INVEST_HORIZON_PLACEMENT,
  ANNEXES_CAPITAL_INVEST_SECTION5_RISQUES,
  ANNEXES_CAPITAL_INVEST_SECTION5_RISKS_BODY,
} from "@/lib/souscription-cif/annexes-capital-invest-pros-cons-table";
import {
  ANNEXES_SCPI_PAGE1_BODY_AFTER_SECTION,
  ANNEXES_SCPI_PAGE1_BODY_BEFORE_SECTION,
  ANNEXES_SCPI_PRODUCT_SECTION_TITLE,
  ANNEXES_SCPI_RENDEMENT_AMF_RISK_LEVEL,
  ANNEXES_SCPI_RENDEMENT_HORIZON_PLACEMENT,
} from "@/lib/souscription-cif/annexes-rapport-scpi-page1";
import { ANNEXES_SCPI_PAGE2_BODY } from "@/lib/souscription-cif/annexes-rapport-scpi-page2";
import { ANNEXES_SCPI_SECTION3_MODALITES_BODY } from "@/lib/souscription-cif/annexes-rapport-scpi-modalites-acquisition";
import {
  ANNEXES_SCPI_PROS_CONS_FISCAL_ROWS,
  ANNEXES_SCPI_SECTION4_INTRO,
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
import {
  ANNEXES_SCPI_PAGE6_SECTION1,
  ANNEXES_SCPI_PAGE6_SECTION2_TITLE,
  ANNEXES_SCPI_PAGE6_SECTION3_TITLE,
  ANNEXES_SCPI_PAGE6_SECTION4_TITLE,
} from "@/lib/souscription-cif/annexes-rapport-scpi-page6";
import { ANNEXES_SCPI_OBJECTIFS_PATRIMONIAUX_ROWS } from "@/lib/souscription-cif/annexes-scpi-objectifs-patrimoniaux-table";
import { ANNEXES_SCPI_CARACTERISTIQUES_OPERATION_SECTIONS } from "@/lib/souscription-cif/annexes-scpi-caracteristiques-operation-table";
import { buildAnnexesScpiHorizonProfilRowViews } from "@/lib/souscription-cif/annexes-scpi-horizon-profil-table";
import {
  ANNEXES_SCPI_PAGE7_CERTIFICATION,
  ANNEXES_SCPI_PAGE7_SECTION5_INTRO,
  ANNEXES_SCPI_PAGE7_SECTION6_INTRO,
  ANNEXES_SCPI_PAGE7_SECTION7,
} from "@/lib/souscription-cif/annexes-rapport-scpi-page7";
import {
  buildAnnexesScpiOrigineFondsView,
  collectAnnexesOrigineFondsMissingKeys,
} from "@/lib/souscription-cif/annexes-scpi-origine-fonds";
import { ANNEXES_SCPI_PAGE8_BODY } from "@/lib/souscription-cif/annexes-rapport-scpi-page8";
import { ANNEXES_SCPI_PAGE5_TABLE_HEADER } from "@/lib/souscription-cif/annexes-rapport-scpi-page5";
import { ANNEXES_SCPI_RECAP_ROW_TEMPLATES } from "@/lib/souscription-cif/annexes-scpi-recap-table";
import { buildAnnexesScpiCostsRows } from "@/lib/souscription-cif/build-annexes-scpi-costs";
import { ANNEXES_RAPPORT_DOCUMENT_TITLE } from "@/lib/souscription-cif/cif-documents";
import type { SouscriptionDossierFields } from "@/lib/souscription-cif/dossier-fields";
import { SCPI_LM_PAGE1_FOOTER_DEFAULT } from "@/lib/souscription-cif/scpi-lettre-mission-page1";
import {
  buildAnnexesRenonciationHeader,
  buildCifDocumentFooterSegments,
  collectMissingFromPage,
  renderTemplateSegments,
  type ScpiLettreMissionPreview,
  type ScpiLmPagePreview,
} from "@/lib/souscription-cif/render-template";
import type { SouscriptionCifProductType } from "@/lib/souscription-cif/souscription-cif-storage";

function buildAnnexesCapitalInvestRapportPreview(
  variables: Record<string, string | null>,
  dossier: SouscriptionDossierFields,
  footerOverride?: string | null
): ScpiLettreMissionPreview {
  const footerSegments = buildCifDocumentFooterSegments(variables, footerOverride);

  const page1: ScpiLmPagePreview = {
    pageNumber: 1,
    title: ANNEXES_RAPPORT_DOCUMENT_TITLE,
    bodySegments: renderTemplateSegments(
      ANNEXES_CAPITAL_INVEST_PAGE1_BODY_BEFORE_SECTION,
      variables
    ),
    centeredSectionTitle: ANNEXES_CAPITAL_INVEST_PRODUCT_SECTION_TITLE,
    bodySegmentsContinuation: renderTemplateSegments(
      ANNEXES_CAPITAL_INVEST_PAGE1_BODY_AFTER_SECTION,
      variables
    ),
    showCapitalInvestLifecycleDiagram: true,
    bodySegmentsAfterCapitalInvestLifecycleDiagram: renderTemplateSegments(
      ANNEXES_CAPITAL_INVEST_BODY_AFTER_DIAGRAM,
      variables
    ),
    bodySegmentsBeforeCapitalInvestFiscaliteTable: renderTemplateSegments(
      ANNEXES_CAPITAL_INVEST_BEFORE_FISCALITE_TABLE,
      variables
    ),
    showCapitalInvestFiscaliteTable: true,
    bodySegmentsAfterCapitalInvestFiscaliteTable: renderTemplateSegments(
      `${ANNEXES_CAPITAL_INVEST_BODY_AFTER_FISCALITE_TABLE}\n\n${ANNEXES_CAPITAL_INVEST_SECTION32_SORTIE}\n\n${ANNEXES_CAPITAL_INVEST_SECTION4_INTRO}`,
      variables
    ),
    showAnnexesProsConsTable: true,
    annexesProsConsRows: ANNEXES_CAPITAL_INVEST_PROS_CONS_ROWS,
    footerSegments,
  };

  const page2: ScpiLmPagePreview = {
    pageNumber: 2,
    bodySegments: renderTemplateSegments(ANNEXES_CAPITAL_INVEST_SECTION5_RISQUES, variables),
    showAmfRiskScale: true,
    amfRiskHighlightLevel: ANNEXES_CAPITAL_INVEST_AMF_RISK_LEVEL,
    amfRiskInvestmentHorizon: ANNEXES_CAPITAL_INVEST_HORIZON_PLACEMENT,
    bodySegmentsAfterTable: renderTemplateSegments(
      ANNEXES_CAPITAL_INVEST_SECTION5_RISKS_BODY,
      variables
    ),
    footerSegments,
  };

  const page3: ScpiLmPagePreview = {
    pageNumber: 3,
    bodySegments: renderTemplateSegments(ANNEXES_CAPITAL_INVEST_PRECONISATIONS_BODY, variables),
    footerSegments,
  };

  const page4: ScpiLmPagePreview = {
    pageNumber: 4,
    bodySegments: [],
    rapportRecapTableHeader: ANNEXES_CAPITAL_INVEST_RECAP_TABLE_HEADER,
    rapportRecapRows: buildAnnexesCapitalInvestRecapRows(variables, dossier),
    footerSegments,
  };

  const missing = new Set<string>([
    ...collectMissingFromPage(page1),
    ...collectMissingFromPage(page2),
    ...collectMissingFromPage(page3),
    ...collectMissingFromPage(page4),
  ]);

  return {
    pages: [page1, page2, page3, page4],
    missingKeys: [...missing],
  };
}

function buildAnnexesScpiRapportPreview(
  variables: Record<string, string | null>,
  dossier: SouscriptionDossierFields,
  footerOverride?: string | null,
  profilRisqueSri?: number | null
): ScpiLettreMissionPreview {
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
    footerSegments,
  };
  collectMissingFromPage(page2).forEach((k) => missing.add(k));

  const page3: ScpiLmPagePreview = {
    pageNumber: 3,
    bodySegments: renderTemplateSegments(ANNEXES_SCPI_SECTION3_MODALITES_BODY, variables),
    footerSegments,
  };
  collectMissingFromPage(page3).forEach((k) => missing.add(k));

  const page4: ScpiLmPagePreview = {
    pageNumber: 4,
    bodySegments: renderTemplateSegments(ANNEXES_SCPI_SECTION4_INTRO, variables),
    showAnnexesProsConsTable: true,
    bodySegmentsAfterProsConsTable: renderTemplateSegments(
      ANNEXES_SCPI_PAGE3_SECTION42_TITLE,
      variables
    ),
    annexesProsConsFiscalRows: ANNEXES_SCPI_PROS_CONS_FISCAL_ROWS,
    bodySegmentsAfterFiscalProsConsTable: renderTemplateSegments(
      ANNEXES_SCPI_PAGE3_RISKS_BODY,
      variables
    ),
    footerSegments,
  };
  collectMissingFromPage(page4).forEach((k) => missing.add(k));

  const page5: ScpiLmPagePreview = {
    pageNumber: 5,
    bodySegments: renderTemplateSegments(ANNEXES_SCPI_PAGE4_INTRO, variables),
    footerSegments,
  };
  collectMissingFromPage(page5).forEach((k) => missing.add(k));

  const page6: ScpiLmPagePreview = {
    pageNumber: 6,
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
  collectMissingFromPage(page6).forEach((k) => missing.add(k));

  const page7: ScpiLmPagePreview = {
    pageNumber: 7,
    bodySegments: renderTemplateSegments(ANNEXES_SCPI_PAGE6_SECTION1, variables),
    bodySegmentsAfterTable: renderTemplateSegments(ANNEXES_SCPI_PAGE6_SECTION2_TITLE, variables),
    showAnnexesObjectifsPatrimoniauxTable: true,
    annexesObjectifsPatrimoniauxRows: ANNEXES_SCPI_OBJECTIFS_PATRIMONIAUX_ROWS,
    bodySegmentsAfterObjectifsPatrimoniauxTable: renderTemplateSegments(
      ANNEXES_SCPI_PAGE6_SECTION3_TITLE,
      variables
    ),
    showAnnexesCaracteristiquesOperationTable: true,
    annexesCaracteristiquesOperationSections: ANNEXES_SCPI_CARACTERISTIQUES_OPERATION_SECTIONS,
    bodySegmentsAfterCaracteristiquesOperationTable: renderTemplateSegments(
      ANNEXES_SCPI_PAGE6_SECTION4_TITLE,
      variables
    ),
    showAnnexesHorizonProfilTable: true,
    annexesHorizonProfilRows: buildAnnexesScpiHorizonProfilRowViews(profilRisqueSri),
    footerSegments,
  };
  collectMissingFromPage(page7).forEach((k) => missing.add(k));

  const page8: ScpiLmPagePreview = {
    pageNumber: 8,
    bodySegments: renderTemplateSegments(ANNEXES_SCPI_PAGE7_SECTION5_INTRO, variables),
    showAnnexesOrigineFondsSection: true,
    annexesOrigineFondsView: buildAnnexesScpiOrigineFondsView(dossier),
    bodySegmentsAfterOrigineFonds: renderTemplateSegments(ANNEXES_SCPI_PAGE7_CERTIFICATION, variables),
    bodySegmentsSection6Intro: renderTemplateSegments(ANNEXES_SCPI_PAGE7_SECTION6_INTRO, variables),
    bodySegmentsSection7: renderTemplateSegments(ANNEXES_SCPI_PAGE7_SECTION7, variables),
    footerSegments,
  };
  collectMissingFromPage(page8).forEach((k) => missing.add(k));
  collectAnnexesOrigineFondsMissingKeys(dossier).forEach((k) => missing.add(k));

  const page9: ScpiLmPagePreview = {
    pageNumber: 9,
    ...buildAnnexesRenonciationHeader(variables),
    bodySegments: renderTemplateSegments(ANNEXES_SCPI_PAGE8_BODY, variables),
    footerSegments,
  };
  collectMissingFromPage(page9).forEach((k) => missing.add(k));

  return {
    pages: [page1, page2, page3, page4, page5, page6, page7, page8, page9],
    missingKeys: [...missing],
  };
}

export function buildAnnexesRapportPreview(
  productType: SouscriptionCifProductType,
  variables: Record<string, string | null>,
  dossier: SouscriptionDossierFields,
  footerOverride?: string | null,
  profilRisqueSri?: number | null
): ScpiLettreMissionPreview {
  if (productType === "capital-investissement") {
    return buildAnnexesCapitalInvestRapportPreview(variables, dossier, footerOverride);
  }
  if (productType !== "scpi") {
    return { pages: [], missingKeys: [] };
  }
  return buildAnnexesScpiRapportPreview(
    variables,
    dossier,
    footerOverride,
    profilRisqueSri
  );
}

export { SCPI_LM_PAGE1_FOOTER_DEFAULT as ANNEXES_RAPPORT_FOOTER_DEFAULT };
