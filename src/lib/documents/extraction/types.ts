export type IdentityDocumentKind = "cni" | "passport";

export type IdentityDocumentLayout =
  | "two_pages"
  | "two_pages_reversed"
  | "two_files"
  | "single_page_both_sides"
  | "cni_side_by_side"
  | "passport"
  | "passport_multi_page"
  | "native"
  | "image";

export type IdentityOcrRegionRole = "recto" | "verso" | "mrz";

export type IdentityOcrRegionPlan = {
  page: number;
  scale: number;
  mode: "visual" | "mrz";
  role: IdentityOcrRegionRole;
  region?: {
    topRatio: number;
    heightRatio: number;
    /** Défaut 0 — utile scan CNI recto|verso côte à côte. */
    leftRatio?: number;
    /** Défaut 1 */
    widthRatio?: number;
  };
};

export type IdentityExtractedText = {
  rectoText: string;
  versoText: string;
  /** Concaténation pour détection automatique legacy. */
  text: string;
  usedOcr: boolean;
  layout: IdentityDocumentLayout;
  documentKind: IdentityDocumentKind;
};
