import { readPdfFile } from "@/lib/api/tauri-pdf";
import { cropImageDataUrl } from "@/lib/documents/extraction/image-crop";
import {
  inferIdentityDocumentKindFromPath,
  refineIdentityDocumentKind,
  resolveIdentityDocumentKindFromPaths,
  getImageDimensions,
  isLikelyCniSideBySideScan,
} from "@/lib/documents/extraction/identity-document-kind";
import {
  buildCniImageOcrPlan,
  buildCniOcrPlan,
  buildPassportImageOcrPlan,
  buildPassportMrzProbePlan,
  buildPassportSinglePagePlan,
  buildRectoOnlyPlan,
  buildVersoOnlyCniPlan,
} from "@/lib/documents/extraction/identity-layout";
import {
  normalizeImageBlobToDataUrl,
  ORIENTATION_PROBE_DEGREES,
  rotateDataUrl,
} from "@/lib/documents/extraction/image-normalize";
import { scoreMrzOcrText, recognizeMrzDataUrl } from "@/lib/documents/extraction/ocr/mrz-ocr";
import { recognizeDataUrl } from "@/lib/documents/extraction/ocr/recognize";
import { terminateOcrWorker } from "@/lib/documents/extraction/ocr/worker";
import { getPdfPageCount, renderPdfPageToDataUrl } from "@/lib/documents/extraction/pdf-render";
import type {
  IdentityDocumentKind,
  IdentityDocumentLayout,
  IdentityExtractedText,
  IdentityOcrRegionPlan,
  IdentityOcrRegionRole,
} from "@/lib/documents/extraction/types";
import { extractTextFromPDFPath, isNativeTextPDF } from "@/lib/pdf";

export { terminateOcrWorker };

const MRZ_VERIFIED_SCORE = 200;

function isImagePath(path: string): boolean {
  return /\.(jpe?g|png|webp)$/i.test(path);
}

function isPdfPath(path: string): boolean {
  return /\.pdf$/i.test(path);
}

function mimeFromPath(path: string): string {
  if (/\.png$/i.test(path)) return "image/png";
  if (/\.webp$/i.test(path)) return "image/webp";
  return "image/jpeg";
}

async function recognizeRegion(crop: string, plan: IdentityOcrRegionPlan): Promise<string> {
  if (plan.mode === "mrz") {
    return recognizeMrzDataUrl(crop);
  }
  return recognizeDataUrl(crop, "visual");
}

async function ocrRegionsFromDataUrl(
  dataUrl: string,
  plans: IdentityOcrRegionPlan[]
): Promise<{ rectoText: string; versoText: string }> {
  const buckets: Record<IdentityOcrRegionRole, string[]> = {
    recto: [],
    verso: [],
    mrz: [],
  };

  for (const plan of plans) {
    const crop = await cropImageDataUrl(dataUrl, plan);
    const text = await recognizeRegion(crop, plan);
    if (text.trim()) buckets[plan.role].push(text);
  }

  return {
    rectoText: buckets.recto.join("\n\n"),
    versoText: [...buckets.verso, ...buckets.mrz].join("\n\n"),
  };
}

async function ocrPdfRegions(
  filePath: string,
  plans: IdentityOcrRegionPlan[]
): Promise<{ rectoText: string; versoText: string }> {
  const buckets: Record<IdentityOcrRegionRole, string[]> = {
    recto: [],
    verso: [],
    mrz: [],
  };

  for (const plan of plans) {
    const dataUrl = await renderPdfPageToDataUrl(
      filePath,
      plan.page,
      plan.scale,
      plan.region
    );
    const text = await recognizeRegion(dataUrl, plan);
    if (text.trim()) buckets[plan.role].push(text);
  }

  return {
    rectoText: buckets.recto.join("\n\n"),
    versoText: [...buckets.verso, ...buckets.mrz].join("\n\n"),
  };
}

function combineIdentityText(rectoText: string, versoText: string): string {
  return [rectoText, versoText].filter(Boolean).join("\n\n");
}

function parseMrzInText(text: string): boolean {
  return /IDFRA|P<[A-Z]{3}|^[A-Z0-9<]{28,}/m.test(text);
}

function cniImagePlans(kind: IdentityDocumentKind, dims: { width: number; height: number }) {
  if (isLikelyCniSideBySideScan(kind, dims)) {
    return { plans: buildCniImageOcrPlan(true), layout: "cni_side_by_side" as const };
  }
  return { plans: buildCniImageOcrPlan(false), layout: "single_page_both_sides" as const };
}

function passportImagePlan() {
  return { plans: buildPassportImageOcrPlan(), layout: "passport" as const };
}

async function ocrImageWithStrategies(
  dataUrl: string,
  kind: IdentityDocumentKind,
  dims: { width: number; height: number }
): Promise<{
  rectoText: string;
  versoText: string;
  layout: IdentityDocumentLayout;
  documentKind: IdentityDocumentKind;
}> {
  const strategies: Array<{
    kind: IdentityDocumentKind;
    plans: IdentityOcrRegionPlan[];
    layout: IdentityDocumentLayout;
  }> = [];

  if (kind === "passport") {
    const p = passportImagePlan();
    strategies.push({ kind: "passport", ...p });
    const cni = cniImagePlans("cni", dims);
    strategies.push({ kind: "cni", plans: cni.plans, layout: cni.layout });
  } else {
    const cni = cniImagePlans("cni", dims);
    strategies.push({ kind: "cni", plans: cni.plans, layout: cni.layout });
    const p = passportImagePlan();
    strategies.push({ kind: "passport", ...p });
  }

  let best = await ocrRegionsFromDataUrl(dataUrl, strategies[0]!.plans);
  let bestMeta = strategies[0]!;

  for (const strategy of strategies.slice(1)) {
    const candidate = await ocrRegionsFromDataUrl(dataUrl, strategy.plans);
    if (scoreMrzOcrText(candidate.versoText) > scoreMrzOcrText(best.versoText)) {
      best = candidate;
      bestMeta = strategy;
    }
  }

  if (scoreMrzOcrText(best.versoText) >= MRZ_VERIFIED_SCORE) {
    return { ...best, layout: bestMeta.layout, documentKind: bestMeta.kind };
  }

  for (const degrees of ORIENTATION_PROBE_DEGREES) {
    const rotated = await rotateDataUrl(dataUrl, degrees);
    for (const strategy of strategies) {
      const candidate = await ocrRegionsFromDataUrl(rotated, strategy.plans);
      if (scoreMrzOcrText(candidate.versoText) > scoreMrzOcrText(best.versoText)) {
        best = candidate;
        bestMeta = strategy;
      }
    }
    if (scoreMrzOcrText(best.versoText) >= MRZ_VERIFIED_SCORE) break;
  }

  return { ...best, layout: bestMeta.layout, documentKind: bestMeta.kind };
}

async function ocrPassportPdf(
  filePath: string,
  pageCount: number
): Promise<{
  rectoText: string;
  versoText: string;
  layout: IdentityDocumentLayout;
}> {
  if (pageCount <= 1) {
    const result = await ocrPdfRegions(filePath, buildPassportSinglePagePlan(1));
    return { ...result, layout: "passport" };
  }

  let bestPage = 1;
  let bestScore = -1;
  let bestMrzText = "";

  for (let page = 1; page <= pageCount; page++) {
    const probe = await ocrPdfRegions(filePath, buildPassportMrzProbePlan(page));
    const score = scoreMrzOcrText(probe.versoText);
    if (score > bestScore) {
      bestScore = score;
      bestPage = page;
      bestMrzText = probe.versoText;
    }
  }

  const visualPlans = buildPassportSinglePagePlan(bestPage).filter((p) => p.role === "recto");
  const visual = await ocrPdfRegions(filePath, visualPlans);

  return {
    rectoText: visual.rectoText,
    versoText: bestMrzText,
    layout: "passport_multi_page",
  };
}

async function ocrCniPdf(
  filePath: string,
  pageCount: number
): Promise<{
  rectoText: string;
  versoText: string;
  layout: IdentityDocumentLayout;
}> {
  const normalPlans = buildCniOcrPlan(pageCount, false);
  let result = await ocrPdfRegions(filePath, normalPlans);
  let layout: IdentityDocumentLayout =
    pageCount >= 2 ? "two_pages" : "single_page_both_sides";

  if (pageCount >= 2 && scoreMrzOcrText(result.versoText) < MRZ_VERIFIED_SCORE) {
    const reversedPlans = buildCniOcrPlan(pageCount, true);
    const reversed = await ocrPdfRegions(filePath, reversedPlans);
    if (scoreMrzOcrText(reversed.versoText) > scoreMrzOcrText(result.versoText)) {
      result = reversed;
      layout = "two_pages_reversed";
    }
  }

  return { ...result, layout };
}

async function loadNormalizedImageDataUrl(filePath: string): Promise<string> {
  const bytes = await readPdfFile(filePath);
  const blob = new Blob([Uint8Array.from(bytes)], { type: mimeFromPath(filePath) });
  return normalizeImageBlobToDataUrl(blob);
}

async function extractRectoSideText(filePath: string): Promise<{ text: string; usedOcr: boolean }> {
  if (isImagePath(filePath)) {
    const dataUrl = await loadNormalizedImageDataUrl(filePath);
    const result = await ocrRegionsFromDataUrl(dataUrl, buildRectoOnlyPlan());
    return { text: result.rectoText, usedOcr: true };
  }

  if (!isPdfPath(filePath)) {
    throw new Error("Format non supporté (PDF, JPG, PNG)");
  }

  try {
    const extracted = await extractTextFromPDFPath(filePath);
    if (isNativeTextPDF(extracted.text) && !parseMrzInText(extracted.text)) {
      return { text: extracted.text, usedOcr: false };
    }
  } catch {
    // PDF scanné
  }

  const result = await ocrPdfRegions(filePath, buildRectoOnlyPlan(1));
  return { text: result.rectoText, usedOcr: true };
}

async function extractVersoSideText(
  filePath: string,
  documentKind: IdentityDocumentKind
): Promise<{ text: string; usedOcr: boolean }> {
  if (isImagePath(filePath)) {
    const dataUrl = await loadNormalizedImageDataUrl(filePath);
    const plans =
      documentKind === "passport" ? buildPassportSinglePagePlan(1) : buildVersoOnlyCniPlan();
    const result = await ocrRegionsFromDataUrl(dataUrl, plans);
    const text =
      documentKind === "passport"
        ? combineIdentityText(result.rectoText, result.versoText)
        : result.versoText;
    return { text, usedOcr: true };
  }

  if (!isPdfPath(filePath)) {
    throw new Error("Format non supporté (PDF, JPG, PNG)");
  }

  try {
    const extracted = await extractTextFromPDFPath(filePath);
    if (isNativeTextPDF(extracted.text) && parseMrzInText(extracted.text)) {
      return { text: extracted.text, usedOcr: false };
    }
  } catch {
    // PDF scanné
  }

  const pageCount = await getPdfPageCount(filePath);

  if (documentKind === "passport") {
    const { rectoText, versoText } = await ocrPassportPdf(filePath, pageCount);
    return { text: combineIdentityText(rectoText, versoText), usedOcr: true };
  }

  let result = await ocrPdfRegions(filePath, buildVersoOnlyCniPlan(1));
  if (pageCount >= 2 && scoreMrzOcrText(result.versoText) < MRZ_VERIFIED_SCORE) {
    const page2 = await ocrPdfRegions(filePath, buildVersoOnlyCniPlan(2));
    if (scoreMrzOcrText(page2.versoText) > scoreMrzOcrText(result.versoText)) {
      result = page2;
    }
  }

  return { text: result.versoText, usedOcr: true };
}

/** Recto et verso dans deux fichiers distincts (photos ou PDF 1 page chacun). */
export async function extractIdentityTextFromRectoVersoFiles(
  rectoPath: string,
  versoPath: string
): Promise<IdentityExtractedText> {
  const documentKind = resolveIdentityDocumentKindFromPaths(rectoPath, versoPath);
  const recto = await extractRectoSideText(rectoPath);
  const verso = await extractVersoSideText(versoPath, documentKind);

  return {
    rectoText: recto.text,
    versoText: verso.text,
    text: combineIdentityText(recto.text, verso.text),
    usedOcr: recto.usedOcr || verso.usedOcr,
    layout: "two_files",
    documentKind,
  };
}

/** Extraction recto / verso (PDF, photo, scan — CNI ancienne/nouvelle, passeport TD3). */
export async function extractIdentityTextFromFile(
  filePath: string
): Promise<IdentityExtractedText> {
  if (isImagePath(filePath)) {
    const bytes = await readPdfFile(filePath);
    const blob = new Blob([Uint8Array.from(bytes)], { type: mimeFromPath(filePath) });
    const dataUrl = await normalizeImageBlobToDataUrl(blob);
    const dims = await getImageDimensions(dataUrl);
    const hinted = inferIdentityDocumentKindFromPath(filePath);
    const kind = refineIdentityDocumentKind(hinted, dims);
    const { rectoText, versoText, layout, documentKind } = await ocrImageWithStrategies(
      dataUrl,
      kind,
      dims
    );
    return {
      rectoText,
      versoText,
      text: combineIdentityText(rectoText, versoText),
      usedOcr: true,
      layout: layout === "single_page_both_sides" ? "image" : layout,
      documentKind,
    };
  }

  if (!isPdfPath(filePath)) {
    throw new Error("Format non supporté (PDF, JPG, PNG)");
  }

  const documentKind = inferIdentityDocumentKindFromPath(filePath) ?? "cni";

  let nativeText = "";
  try {
    const extracted = await extractTextFromPDFPath(filePath);
    nativeText = extracted.text;
    if (isNativeTextPDF(nativeText) && parseMrzInText(nativeText)) {
      const nativeKind = /P<[A-Z]{3}/.test(nativeText) ? "passport" : documentKind;
      return {
        rectoText: nativeText,
        versoText: nativeText,
        text: nativeText,
        usedOcr: false,
        layout: "native",
        documentKind: nativeKind,
      };
    }
  } catch {
    // PDF scanné
  }

  const pageCount = await getPdfPageCount(filePath);

  if (documentKind === "passport") {
    const { rectoText, versoText, layout } = await ocrPassportPdf(filePath, pageCount);
    const ocrCombined = combineIdentityText(rectoText, versoText);
    return {
      rectoText,
      versoText,
      text: ocrCombined.length > nativeText.length ? ocrCombined : nativeText,
      usedOcr: true,
      layout,
      documentKind: "passport",
    };
  }

  const { rectoText, versoText, layout } = await ocrCniPdf(filePath, pageCount);
  const ocrCombined = combineIdentityText(rectoText, versoText);

  return {
    rectoText,
    versoText,
    text: ocrCombined.length > nativeText.length ? ocrCombined : nativeText,
    usedOcr: true,
    layout,
    documentKind: "cni",
  };
}

export function isIdentityFilePath(path: string): boolean {
  return isPdfPath(path) || isImagePath(path);
}
