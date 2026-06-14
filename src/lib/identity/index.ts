export { mrzCheckDigit, mrzCheckDigitValid } from "@/lib/identity/mrz-checksum";
export {
  extractMrzLines,
  parseMrzFromText,
  parseMrzLines,
  isMrzFullyVerified,
  type ParsedMrz,
  type MrzFormat,
  type MrzChecksVerified,
} from "@/lib/identity/mrz-parser";
export {
  extractVisualIdentityFields,
  normalizeIdentityDate,
  type VisualIdentityFields,
} from "@/lib/identity/visual-identity-parser";
export {
  parseIdentityFromText,
  parseIdentityFromRegions,
  identityDateFrToIso,
  identityDateFrToFormField,
  looksLikeIdentityDocument,
  isLikelyIdentityFileName,
  type IdentityExtractResult,
  type FieldProvenance,
} from "@/lib/identity/parse-identity-document";
export {
  getIdentityApplyRequirements,
  IDENTITY_LOCAL_PROCESSING_NOTICE,
  summarizeMrzTrust,
} from "@/lib/identity/identity-extraction-policy";
export {
  resolveIdentityUserMessage,
  resolveIdentityToastMessage,
} from "@/lib/identity/identity-status-messages";
export { buildIdentityMergePatch, type IdentityMergePreview } from "@/lib/identity/merge-identity-fields";
export {
  buildCniImageOcrPlan,
  buildCniOcrPlan,
  resolveCniPdfLayout,
  type CniOcrRegionPlan,
  type CniPdfLayout,
} from "@/lib/identity/identity-pdf-layout";
export { extractIdentityFromFilePath } from "@/lib/identity/extract-identity-from-file";
export { extractIdentityFromRectoVersoFiles } from "@/lib/identity/extract-identity-from-file";
export {
  extractCniTextFromFile,
  extractTextFromIdentityFile,
  isIdentityFilePath,
  terminateOcrWorker,
} from "@/lib/identity/ocr-extract";
export {
  extractIdentityTextFromFile,
  selectBestMrzOcrText,
  type IdentityExtractedText,
  type IdentityOcrRegionPlan,
} from "@/lib/documents";
