import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { readPdfFile } from "@/lib/api/tauri-pdf";
import { cropCanvasRegion, type CropRegion } from "@/lib/documents/extraction/image-crop";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

/** Rend une page PDF en PNG (data URL) pour OCR. */
export async function renderPdfPageToDataUrl(
  filePath: string,
  pageNumber = 1,
  scale = 2,
  region?: CropRegion
): Promise<string> {
  const bytes = await readPdfFile(filePath);
  const pdf = await pdfjsLib.getDocument({ data: bytes.buffer as ArrayBuffer }).promise;
  const page = await pdf.getPage(Math.min(pageNumber, pdf.numPages));
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D indisponible");
  await page.render({ canvasContext: ctx, viewport, canvas }).promise;

  if (!region) {
    return canvas.toDataURL("image/png");
  }

  return cropCanvasRegion(canvas, region);
}

export async function getPdfPageCount(filePath: string): Promise<number> {
  const bytes = await readPdfFile(filePath);
  const pdf = await pdfjsLib.getDocument({ data: bytes.buffer as ArrayBuffer }).promise;
  return pdf.numPages;
}
