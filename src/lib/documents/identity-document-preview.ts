import {
  renderAllPdfPagesToDataUrls,
} from "@/lib/documents/extraction/pdf-render";
import {
  localImageToDataUrl,
  readLocalImageFile,
} from "@/lib/api/tauri-secure-files";

export type IdentityPreviewPage = {
  label: string;
  dataUrl: string;
};

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

export class IdentityDocumentPreviewError extends Error {
  readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "IdentityDocumentPreviewError";
    this.cause = cause;
  }
}

/** Charge toutes les pages d'un fichier (PDF multi-pages ou image unique). */
export async function loadIdentityDocumentPreviewPages(
  filePath: string,
  side?: "recto" | "verso"
): Promise<IdentityPreviewPage[]> {
  const path = filePath.trim();
  if (!path) return [];

  try {
    if (isPdfPath(path)) {
      const dataUrls = await renderAllPdfPagesToDataUrls(path, 1.5);
      if (dataUrls.length === 0) {
        throw new IdentityDocumentPreviewError("Le PDF ne contient aucune page lisible.");
      }
      return dataUrls.map((dataUrl, index) => ({
        label: labelForPage(index + 1, dataUrls.length, side),
        dataUrl,
      }));
    }

    const image = await readLocalImageFile(path);
    return [
      {
        label: side === "recto" ? "Recto" : side === "verso" ? "Verso" : "Document",
        dataUrl: localImageToDataUrl(image.bytes, image.mime),
      },
    ];
  } catch (error) {
    console.error("Impossible de charger l'aperçu pièce d'identité:", error);
    const message =
      error instanceof Error ? error.message : "Erreur inconnue lors du rendu du PDF.";
    throw new IdentityDocumentPreviewError(message, error);
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
    try {
      pages.push(...(await loadIdentityDocumentPreviewPages(rectoPath, side)));
    } catch (error) {
      console.error("Aperçu recto indisponible:", error);
    }
  }

  if (versoPath?.trim()) {
    try {
      pages.push(...(await loadIdentityDocumentPreviewPages(versoPath, "verso")));
    } catch (error) {
      console.error("Aperçu verso indisponible:", error);
    }
  }

  return pages;
}
