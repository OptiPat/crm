export type {
  IdentityDocumentKind,
  IdentityDocumentLayout,
  IdentityExtractedText,
  IdentityOcrRegionPlan,
  IdentityOcrRegionRole,
} from "@/lib/documents/extraction/types";

export {
  inferIdentityDocumentKindFromPath,
  refineIdentityDocumentKind,
} from "@/lib/documents/extraction/identity-document-kind";

export {
  buildCniImageOcrPlan,
  buildCniOcrPlan,
  buildPassportImageOcrPlan,
  buildPassportSinglePagePlan,
  buildCniSideBySideImagePlan,
  resolveCniPdfLayout,
  type CniOcrRegionPlan,
  type CniOcrRegionRole,
  type CniPdfLayout,
} from "@/lib/documents/extraction/identity-layout";

export {
  extractIdentityTextFromFile,
  extractIdentityTextFromRectoVersoFiles,
  isIdentityFilePath,
  terminateOcrWorker,
} from "@/lib/documents/extraction/extract-identity-text";

export { renderPdfPageToDataUrl, getPdfPageCount } from "@/lib/documents/extraction/pdf-render";

export {
  recognizeMrzDataUrl,
  scoreMrzOcrText,
  selectBestMrzOcrText,
} from "@/lib/documents/extraction/ocr/mrz-ocr";
export { preprocessImageDataUrl } from "@/lib/documents/extraction/ocr/preprocess";
