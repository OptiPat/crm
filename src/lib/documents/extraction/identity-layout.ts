import type {
  IdentityDocumentKind,
  IdentityOcrRegionPlan,
} from "@/lib/documents/extraction/types";

/** Plan OCR CNI : recto/verso sur 1 ou 2 pages PDF. */

export type CniPdfLayout = "two_pages" | "single_page_both_sides";

/** @deprecated Préférer IdentityOcrRegionPlan */
export type CniOcrRegionPlan = IdentityOcrRegionPlan;

/** @deprecated Préférer IdentityOcrRegionRole */
export type CniOcrRegionRole = IdentityOcrRegionPlan["role"];

export function resolveCniPdfLayout(pageCount: number): CniPdfLayout {
  return pageCount >= 2 ? "two_pages" : "single_page_both_sides";
}

const MRZ_BAND = { topRatio: 0.58, heightRatio: 0.42 } as const;
const PASSPORT_MRZ_BAND = { topRatio: 0.72, heightRatio: 0.28 } as const;

/** Page passeport TD3 : visuel haut, MRZ en bas (2 lignes ICAO). */
export function buildPassportSinglePagePlan(page = 1): IdentityOcrRegionPlan[] {
  return [
    {
      page,
      scale: 3.5,
      mode: "visual",
      role: "recto",
      region: { topRatio: 0, heightRatio: PASSPORT_MRZ_BAND.topRatio },
    },
    {
      page,
      scale: 5.5,
      mode: "mrz",
      role: "mrz",
      region: PASSPORT_MRZ_BAND,
    },
  ];
}

export function buildPassportImageOcrPlan(): IdentityOcrRegionPlan[] {
  return buildPassportSinglePagePlan(1);
}

/** Sonde MRZ seule sur une page (PDF multi-pages). */
export function buildPassportMrzProbePlan(page: number): IdentityOcrRegionPlan[] {
  return [
    {
      page,
      scale: 5.5,
      mode: "mrz",
      role: "mrz",
      region: PASSPORT_MRZ_BAND,
    },
  ];
}

/**
 * CNI paysage : recto à gauche, verso (+ MRZ) à droite (scan plat).
 * Vieille et nouvelle CNI — MRZ en bas du verso (moitié droite).
 */
export function buildCniSideBySideImagePlan(): IdentityOcrRegionPlan[] {
  return [
    {
      page: 1,
      scale: 3.5,
      mode: "visual",
      role: "recto",
      region: { topRatio: 0, heightRatio: 1, leftRatio: 0, widthRatio: 0.5 },
    },
    {
      page: 1,
      scale: 3.5,
      mode: "visual",
      role: "verso",
      region: { topRatio: 0, heightRatio: 1, leftRatio: 0.5, widthRatio: 0.5 },
    },
    {
      page: 1,
      scale: 5,
      mode: "mrz",
      role: "mrz",
      region: { topRatio: 0.55, heightRatio: 0.45, leftRatio: 0.5, widthRatio: 0.5 },
    },
  ];
}

/**
 * - 2 pages : page 1 = recto, page 2 = verso (+ bande MRZ)
 * - 1 page  : moitié haute = recto, moitié basse = verso (+ bande MRZ)
 */
export function buildCniOcrPlan(pageCount: number, reversed = false): IdentityOcrRegionPlan[] {
  const layout = resolveCniPdfLayout(Math.max(1, pageCount));

  if (layout === "two_pages") {
    const rectoPage = reversed ? 2 : 1;
    const versoPage = reversed ? 1 : 2;
    return [
      { page: rectoPage, scale: 3.5, mode: "visual", role: "recto" },
      { page: versoPage, scale: 3.5, mode: "visual", role: "verso" },
      {
        page: versoPage,
        scale: 5,
        mode: "mrz",
        role: "mrz",
        region: { topRatio: 0.45, heightRatio: 0.55 },
      },
    ];
  }

  return [
    {
      page: 1,
      scale: 3.5,
      mode: "visual",
      role: "recto",
      region: { topRatio: 0, heightRatio: 0.55 },
    },
    {
      page: 1,
      scale: 3.5,
      mode: "visual",
      role: "verso",
      region: { topRatio: 0.45, heightRatio: 0.55 },
    },
    {
      page: 1,
      scale: 5,
      mode: "mrz",
      role: "mrz",
      region: MRZ_BAND,
    },
  ];
}

export function buildCniImageOcrPlan(sideBySide = false): IdentityOcrRegionPlan[] {
  if (sideBySide) return buildCniSideBySideImagePlan();
  return buildCniOcrPlan(1);
}

/** Recto seul (2e fichier ou face avant). */
export function buildRectoOnlyPlan(page = 1): IdentityOcrRegionPlan[] {
  return [{ page, scale: 3.5, mode: "visual", role: "recto" }];
}

/** Verso CNI seul — visuel + bande MRZ. */
export function buildVersoOnlyCniPlan(page = 1): IdentityOcrRegionPlan[] {
  return [
    { page, scale: 3.5, mode: "visual", role: "verso" },
    {
      page,
      scale: 5,
      mode: "mrz",
      role: "mrz",
      region: { topRatio: 0.45, heightRatio: 0.55 },
    },
  ];
}

export function buildIdentityOcrPlan(
  kind: IdentityDocumentKind,
  pageCount: number
): IdentityOcrRegionPlan[] {
  if (kind === "passport") {
    return pageCount <= 1
      ? buildPassportSinglePagePlan(1)
      : buildPassportMrzProbePlan(1);
  }
  return buildCniOcrPlan(pageCount);
}
