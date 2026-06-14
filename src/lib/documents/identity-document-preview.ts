import { exists, readFile } from "@tauri-apps/plugin-fs";
import {
  getPdfPageCount,
  renderPdfPageToDataUrl,
} from "@/lib/documents/extraction/pdf-render";

export type IdentityPreviewPage = {
  label: string;
  dataUrl: string;
};

function mimeFromPath(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".pdf")) return "application/pdf";
  return "image/jpeg";
}

function bytesToDataUrl(bytes: Uint8Array, mime: string): string {
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  return `data:${mime};base64,${btoa(binary)}`;
}

function isPdfPath(path: string): boolean {
  return path.toLowerCase().endsWith(".pdf");
}

function labelForPage(
  pageNum: number,
  total: number,
  side?: "recto" | "verso"
): string {
  if (side === "recto") {
    return total === 1 ? "Recto" : `Recto — page ${pageNum}`;
  }
  if (side === "verso") {
    return total === 1 ? "Verso" : `Verso — page ${pageNum}`;
  }
  if (total === 2) return pageNum === 1 ? "Recto" : "Verso";
  if (total === 1) return "Document";
  return `Page ${pageNum}`;
}

/** Charge toutes les pages d'un fichier (PDF multi-pages ou image unique). */
export async function loadIdentityDocumentPreviewPages(
  filePath: string,
  side?: "recto" | "verso"
): Promise<IdentityPreviewPage[]> {
  const path = filePath.trim();
  if (!path) return [];

  try {
    if (!(await exists(path))) return [];

    if (isPdfPath(path)) {
      const pageCount = await getPdfPageCount(path);
      const pages: IdentityPreviewPage[] = [];
      for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
        const dataUrl = await renderPdfPageToDataUrl(path, pageNum, 1.5);
        pages.push({
          label: labelForPage(pageNum, pageCount, side),
          dataUrl,
        });
      }
      return pages;
    }

    const bytes = await readFile(path);
    return [
      {
        label: side === "recto" ? "Recto" : side === "verso" ? "Verso" : "Document",
        dataUrl: bytesToDataUrl(bytes, mimeFromPath(path)),
      },
    ];
  } catch (error) {
    console.error("Impossible de charger l'aperçu pièce d'identité:", error);
    return [];
  }
}

/** Charge recto + verso (fichiers séparés ou PDF multi-pages). */
export async function loadIdentityPreviewPages(
  rectoPath?: string,
  versoPath?: string
): Promise<IdentityPreviewPage[]> {
  const pages: IdentityPreviewPage[] = [];

  if (rectoPath?.trim()) {
    const side = versoPath?.trim() ? ("recto" as const) : undefined;
    pages.push(...(await loadIdentityDocumentPreviewPages(rectoPath, side)));
  }

  if (versoPath?.trim()) {
    pages.push(...(await loadIdentityDocumentPreviewPages(versoPath, "verso")));
  }

  return pages;
}
