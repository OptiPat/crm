import { readPdfFile } from "@/lib/api/tauri-pdf";
import { cropCanvasRegion, type CropRegion } from "@/lib/documents/extraction/image-crop";
import { loadPdfDocument } from "@/lib/pdf/pdfjs-setup";

type PdfPage = {
  getViewport: (params: { scale: number }) => { width: number; height: number };
  render: (params: {
    canvas: HTMLCanvasElement;
    viewport: { width: number; height: number };
    intent?: string;
  }) => { promise: Promise<void> };
};

function formatPdfRenderError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return "Erreur inconnue lors du rendu du PDF.";
}

function wrapPdfRenderError(error: unknown): Error {
  const wrapped = new Error(formatPdfRenderError(error));
  (wrapped as Error & { cause?: unknown }).cause = error;
  return wrapped;
}

async function renderPdfPageCanvas(page: PdfPage, scale: number): Promise<HTMLCanvasElement> {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D indisponible");

  // pdfjs 5 : passer uniquement `canvas` (pas canvasContext en même temps).
  await page.render({ canvas, viewport, intent: "display" }).promise;
  return canvas;
}

/** Rend une page PDF en PNG (data URL) pour OCR ou aperçu. */
export async function renderPdfPageToDataUrl(
  filePath: string,
  pageNumber = 1,
  scale = 2,
  region?: CropRegion
): Promise<string> {
  try {
    const bytes = await readPdfFile(filePath);
    const pdf = await loadPdfDocument(bytes).promise;
    const page = await pdf.getPage(Math.min(pageNumber, pdf.numPages));
    const canvas = await renderPdfPageCanvas(page, scale);

    if (!region) {
      return canvas.toDataURL("image/png");
    }

    return cropCanvasRegion(canvas, region);
  } catch (error) {
    throw wrapPdfRenderError(error);
  }
}

/** Rend toutes les pages d'un PDF (une seule ouverture du document). */
export async function renderAllPdfPagesToDataUrls(
  filePath: string,
  scale = 1.5
): Promise<string[]> {
  try {
    const bytes = await readPdfFile(filePath);
    const pdf = await loadPdfDocument(bytes).promise;
    const urls: string[] = [];

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const canvas = await renderPdfPageCanvas(page, scale);
      urls.push(canvas.toDataURL("image/png"));
    }

    return urls;
  } catch (error) {
    throw wrapPdfRenderError(error);
  }
}

export async function getPdfPageCount(filePath: string): Promise<number> {
  try {
    const bytes = await readPdfFile(filePath);
    const pdf = await loadPdfDocument(bytes).promise;
    return pdf.numPages;
  } catch (error) {
    throw wrapPdfRenderError(error);
  }
}
