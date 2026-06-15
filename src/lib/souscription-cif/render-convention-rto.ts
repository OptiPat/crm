import {
  RTO_DOCUMENT_TITLE,
  RTO_PAGE1_BODY_AFTER_PREAMBLE,
  RTO_PAGE1_BODY_IDENTIFICATION,
  RTO_PREAMBLE_TITLE,
} from "@/lib/souscription-cif/rto-page1";
import { RTO_PAGE2_BODY } from "@/lib/souscription-cif/rto-page2";
import { RTO_PAGE3_BODY } from "@/lib/souscription-cif/rto-page3";
import { RTO_PAGE4_BODY } from "@/lib/souscription-cif/rto-page4";
import { RTO_PAGE5_BODY } from "@/lib/souscription-cif/rto-page5";
import {
  RTO_PAGE6_BODY,
  RTO_PAGE6_FAIT_A,
  RTO_PAGE6_SIGNATURE_LEFT,
  RTO_PAGE6_SIGNATURE_RIGHT,
} from "@/lib/souscription-cif/rto-page6";
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

export const RTO_DOCUMENT_LABEL = "Convention de réception-transmission d'ordres";

export function buildConventionRtoPreview(
  variables: Record<string, string | null>,
  footerOverride?: string | null
): ScpiLettreMissionPreview {
  const footerSegments = buildCifDocumentFooterSegments(variables, footerOverride);

  const page1: ScpiLmPagePreview = {
    pageNumber: 1,
    ...buildCifDocumentClientHeader(variables),
    title: RTO_DOCUMENT_TITLE,
    bodySegments: renderTemplateSegments(RTO_PAGE1_BODY_IDENTIFICATION, variables),
    centeredPreambleTitle: RTO_PREAMBLE_TITLE,
    bodySegmentsContinuation: renderTemplateSegments(RTO_PAGE1_BODY_AFTER_PREAMBLE, variables),
    footerSegments,
  };

  const missing = new Set<string>(collectMissingFromPage(page1));

  const page2: ScpiLmPagePreview = {
    pageNumber: 2,
    bodySegments: renderTemplateSegments(RTO_PAGE2_BODY, variables),
    footerSegments,
  };
  collectMissingFromPage(page2).forEach((k) => missing.add(k));

  const page3: ScpiLmPagePreview = {
    pageNumber: 3,
    bodySegments: renderTemplateSegments(RTO_PAGE3_BODY, variables),
    footerSegments,
  };
  collectMissingFromPage(page3).forEach((k) => missing.add(k));

  const page4: ScpiLmPagePreview = {
    pageNumber: 4,
    bodySegments: renderTemplateSegments(RTO_PAGE4_BODY, variables),
    footerSegments,
  };
  collectMissingFromPage(page4).forEach((k) => missing.add(k));

  const page5: ScpiLmPagePreview = {
    pageNumber: 5,
    bodySegments: renderTemplateSegments(RTO_PAGE5_BODY, variables),
    footerSegments,
  };
  collectMissingFromPage(page5).forEach((k) => missing.add(k));

  const page6: ScpiLmPagePreview = {
    pageNumber: 6,
    bodySegments: renderTemplateSegments(RTO_PAGE6_BODY, variables),
    bodySegmentsAfterTable: renderTemplateSegments(RTO_PAGE6_FAIT_A, variables),
    signatureColumns: {
      left: renderTemplateLines(RTO_PAGE6_SIGNATURE_LEFT, variables),
      right: renderTemplateLines(RTO_PAGE6_SIGNATURE_RIGHT, variables),
    },
    footerSegments,
  };
  collectMissingFromPage(page6).forEach((k) => missing.add(k));

  return {
    pages: [page1, page2, page3, page4, page5, page6],
    missingKeys: [...missing],
  };
}

export { SCPI_LM_PAGE1_FOOTER_DEFAULT as RTO_FOOTER_DEFAULT };
