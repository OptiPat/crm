/**
 * Rendu Lettre de mission CIF.
 *
 * Document commun à tous les types d'investissement (pages 1–7, articles 1–17).
 * L'article 5 et son tableau recensent les stratégies distribuées (SCPI rendement, SCPI
 * fiscales, capital investissement, G3F, etc.).
 */
import type { AnnexesScpiProsConsRow } from "@/lib/souscription-cif/annexes-scpi-pros-cons-table";
import {
  SCPI_LM_PAGE1_BODY_AFTER_TITLE,
  SCPI_LM_PAGE1_FOOTER_DEFAULT,
  SOUSCRIPTION_VARIABLE_LABELS,
} from "@/lib/souscription-cif/scpi-lettre-mission-page1";
import { SCPI_LM_PAGE2_BODY } from "@/lib/souscription-cif/scpi-lettre-mission-page2";
import { SCPI_LM_PAGE3_BODY } from "@/lib/souscription-cif/scpi-lettre-mission-page3";
import { SCPI_LM_PAGE4_BODY } from "@/lib/souscription-cif/scpi-lettre-mission-page4";
import { SCPI_LM_PAGE4_SECTION6_PART } from "@/lib/souscription-cif/scpi-lettre-mission-page4-section6";
import { SCPI_LM_PAGE5_BODY } from "@/lib/souscription-cif/scpi-lettre-mission-page5";
import { SCPI_LM_PAGE6_BODY } from "@/lib/souscription-cif/scpi-lettre-mission-page6";
import {
  SCPI_LM_PAGE7_BODY,
  SCPI_LM_PAGE7_SIGNATURE_LEFT,
  SCPI_LM_PAGE7_SIGNATURE_RIGHT,
} from "@/lib/souscription-cif/scpi-lettre-mission-page7";

export type SouscriptionPreviewSegment =
  | { kind: "text"; value: string }
  | { kind: "underline"; value: string }
  | { kind: "missing"; key: string; label: string };

export type ScpiLmPagePreview = {
  pageNumber: number;
  headerLeft?: SouscriptionPreviewSegment[][];
  headerRight?: SouscriptionPreviewSegment[];
  title?: string;
  /** Sous-titre section produit centré (annexes). */
  centeredSectionTitle?: string;
  bodySegments: SouscriptionPreviewSegment[];
  /** Suite du corps après centeredSectionTitle. */
  bodySegmentsContinuation?: SouscriptionPreviewSegment[];
  /** Contenu après le tableau instruments (ex. §6.1 en page 4). */
  bodySegmentsAfterTable?: SouscriptionPreviewSegment[];
  footerSegments: SouscriptionPreviewSegment[];
  /** Tableau instruments financiers (article 5 — commun). */
  showInstrumentsTable?: boolean;
  /** Bloc signatures deux colonnes (page 7). */
  signatureColumns?: {
    left: SouscriptionPreviewSegment[][];
    right: SouscriptionPreviewSegment[][];
  };
  /** Tableau récap demande / situation (rapport de mission page 1). */
  rapportRecapRows?: {
    title: string;
    contentSegments: SouscriptionPreviewSegment[];
  }[];
  /** Échelle AMF 1–7 (annexes SCPI). */
  showAmfRiskScale?: boolean;
  /** Case surlignée sur l'échelle AMF (ex. 3 pour SCPI de rendement). */
  amfRiskHighlightLevel?: number;
  /** Horizon de placement sous l'échelle AMF. */
  amfRiskInvestmentHorizon?: string;
  /** Tableau avantages / inconvénients (annexes SCPI § 4.1). */
  showAnnexesProsConsTable?: boolean;
  /** Lignes du tableau avantages / inconvénients (défaut : § 4.1). */
  annexesProsConsRows?: ReadonlyArray<AnnexesScpiProsConsRow>;
  /** Texte après le tableau avantages / inconvénients (annexes § 4.2). */
  bodySegmentsAfterProsConsTable?: SouscriptionPreviewSegment[];
};

export type ScpiLettreMissionPreview = {
  pages: ScpiLmPagePreview[];
  missingKeys: string[];
};

function labelForKey(key: string): string {
  return SOUSCRIPTION_VARIABLE_LABELS[key] ?? key;
}

function expandUnderlineSegments(
  segments: SouscriptionPreviewSegment[]
): SouscriptionPreviewSegment[] {
  const result: SouscriptionPreviewSegment[] = [];
  const re = /\[u\]([\s\S]*?)\[\/u\]/g;

  for (const seg of segments) {
    if (seg.kind !== "text") {
      result.push(seg);
      continue;
    }

    let lastIndex = 0;
    let match: RegExpExecArray | null;
    re.lastIndex = 0;

    while ((match = re.exec(seg.value)) !== null) {
      if (match.index > lastIndex) {
        result.push({ kind: "text", value: seg.value.slice(lastIndex, match.index) });
      }
      result.push({ kind: "underline", value: match[1] });
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < seg.value.length) {
      result.push({ kind: "text", value: seg.value.slice(lastIndex) });
    }
  }

  return result;
}

export function renderTemplateSegments(
  template: string,
  variables: Record<string, string | null>
): SouscriptionPreviewSegment[] {
  const re = /\{\{([a-z0-9_]+)\}\}/g;
  const segments: SouscriptionPreviewSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(template)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ kind: "text", value: template.slice(lastIndex, match.index) });
    }
    const key = match[1];
    const value = variables[key]?.trim();
    if (value) {
      segments.push({ kind: "text", value });
    } else {
      segments.push({ kind: "missing", key, label: labelForKey(key) });
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < template.length) {
    segments.push({ kind: "text", value: template.slice(lastIndex) });
  }

  return expandUnderlineSegments(segments);
}

/** Découpe un modèle ligne par ligne (blocs signatures, en-têtes). */
export function renderTemplateLines(
  template: string,
  variables: Record<string, string | null>
): SouscriptionPreviewSegment[][] {
  return template.split("\n").map((line) => renderTemplateSegments(line, variables));
}

function segmentForVariable(
  key: string,
  variables: Record<string, string | null>
): SouscriptionPreviewSegment {
  const value = variables[key]?.trim();
  if (value) {
    return { kind: "text", value };
  }
  return { kind: "missing", key, label: labelForKey(key) };
}

function collectMissing(segments: SouscriptionPreviewSegment[]): string[] {
  const keys = new Set<string>();
  for (const seg of segments) {
    if (seg.kind === "missing") keys.add(seg.key);
  }
  return [...keys];
}

export function buildCifDocumentClientHeader(
  variables: Record<string, string | null>
): Pick<ScpiLmPagePreview, "headerLeft" | "headerRight"> {
  return {
    headerLeft: [
      [segmentForVariable("client_nom_prenom", variables)],
      [segmentForVariable("client_adresse", variables)],
      [segmentForVariable("client_cp_ville", variables)],
    ],
    headerRight: [
      { kind: "text", value: "À " },
      segmentForVariable("client_ville", variables),
      { kind: "text", value: ", le " },
      segmentForVariable("date_document", variables),
    ],
  };
}

export function buildCifDocumentFooterSegments(
  variables: Record<string, string | null>,
  footerOverride?: string | null
): SouscriptionPreviewSegment[] {
  const footerTemplate = footerOverride?.trim() || SCPI_LM_PAGE1_FOOTER_DEFAULT;
  return renderTemplateSegments(footerTemplate, variables);
}

export function collectMissingFromPage(page: ScpiLmPagePreview): string[] {
  const keys = new Set<string>();
  if (page.headerLeft) {
    for (const line of page.headerLeft) {
      collectMissing(line).forEach((k) => keys.add(k));
    }
  }
  if (page.headerRight) {
    collectMissing(page.headerRight).forEach((k) => keys.add(k));
  }
  collectMissing(page.bodySegments).forEach((k) => keys.add(k));
  if (page.bodySegmentsContinuation) {
    collectMissing(page.bodySegmentsContinuation).forEach((k) => keys.add(k));
  }
  if (page.bodySegmentsAfterProsConsTable) {
    collectMissing(page.bodySegmentsAfterProsConsTable).forEach((k) => keys.add(k));
  }
  if (page.bodySegmentsAfterTable) {
    collectMissing(page.bodySegmentsAfterTable).forEach((k) => keys.add(k));
  }
  if (page.signatureColumns) {
    for (const line of page.signatureColumns.left) {
      collectMissing(line).forEach((k) => keys.add(k));
    }
    for (const line of page.signatureColumns.right) {
      collectMissing(line).forEach((k) => keys.add(k));
    }
  }
  if (page.rapportRecapRows) {
    for (const row of page.rapportRecapRows) {
      collectMissing(row.contentSegments).forEach((k) => keys.add(k));
    }
  }
  collectMissing(page.footerSegments).forEach((k) => keys.add(k));
  return [...keys];
}

export function buildScpiLettreMissionPreview(
  variables: Record<string, string | null>,
  footerOverride?: string | null
): ScpiLettreMissionPreview {
  const footerSegments = buildCifDocumentFooterSegments(variables, footerOverride);

  const page1: ScpiLmPagePreview = {
    pageNumber: 1,
    ...buildCifDocumentClientHeader(variables),
    title: "Lettre de mission",
    bodySegments: renderTemplateSegments(SCPI_LM_PAGE1_BODY_AFTER_TITLE, variables),
    footerSegments,
  };

  const page2: ScpiLmPagePreview = {
    pageNumber: 2,
    bodySegments: renderTemplateSegments(SCPI_LM_PAGE2_BODY, variables),
    footerSegments,
  };

  const page3: ScpiLmPagePreview = {
    pageNumber: 3,
    bodySegments: renderTemplateSegments(SCPI_LM_PAGE3_BODY, variables),
    footerSegments,
  };

  const page4: ScpiLmPagePreview = {
    pageNumber: 4,
    bodySegments: renderTemplateSegments(SCPI_LM_PAGE4_BODY, variables),
    bodySegmentsAfterTable: renderTemplateSegments(SCPI_LM_PAGE4_SECTION6_PART, variables),
    footerSegments,
    showInstrumentsTable: true,
  };

  const page5: ScpiLmPagePreview = {
    pageNumber: 5,
    bodySegments: renderTemplateSegments(SCPI_LM_PAGE5_BODY, variables),
    footerSegments,
  };

  const page6: ScpiLmPagePreview = {
    pageNumber: 6,
    bodySegments: renderTemplateSegments(SCPI_LM_PAGE6_BODY, variables),
    footerSegments,
  };

  const page7: ScpiLmPagePreview = {
    pageNumber: 7,
    bodySegments: renderTemplateSegments(SCPI_LM_PAGE7_BODY, variables),
    signatureColumns: {
      left: renderTemplateLines(SCPI_LM_PAGE7_SIGNATURE_LEFT, variables),
      right: renderTemplateLines(SCPI_LM_PAGE7_SIGNATURE_RIGHT, variables),
    },
    footerSegments,
  };

  const missing = new Set<string>([
    ...collectMissingFromPage(page1),
    ...collectMissingFromPage(page2),
    ...collectMissingFromPage(page3),
    ...collectMissingFromPage(page4),
    ...collectMissingFromPage(page5),
    ...collectMissingFromPage(page6),
    ...collectMissingFromPage(page7),
  ]);

  return {
    pages: [page1, page2, page3, page4, page5, page6, page7],
    missingKeys: [...missing],
  };
}

/** @deprecated Utiliser buildScpiLettreMissionPreview */
export type ScpiLmPage1Preview = ScpiLmPagePreview & { pageNumber: 1; missingKeys: string[] };

export function buildScpiLettreMissionPage1Preview(
  variables: Record<string, string | null>,
  footerOverride?: string | null
): ScpiLmPage1Preview {
  const full = buildScpiLettreMissionPreview(variables, footerOverride);
  return { ...full.pages[0], pageNumber: 1, missingKeys: full.missingKeys };
}
