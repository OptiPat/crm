import type { IdentityDocumentKind } from "@/lib/documents/extraction/types";

const PASSPORT_NAME_RE = /passeport|passport/i;
const CNI_NAME_RE = /cni|carte.?nationale|identit[eé]/i;

export function inferIdentityDocumentKindFromPath(filePath: string): IdentityDocumentKind | undefined {
  const fileName = filePath.split(/[/\\]/).pop() ?? filePath;
  if (PASSPORT_NAME_RE.test(fileName)) return "passport";
  if (CNI_NAME_RE.test(fileName)) return "cni";
  return undefined;
}

/** Passeport ou CNI explicite dans le nom ; sinon ambigu (validité stricte côté conformité). */
export function classifyIdentityDocumentKindFromPath(
  filePath: string
): IdentityDocumentKind | "ambiguous" {
  return inferIdentityDocumentKindFromPath(filePath) ?? "ambiguous";
}

export function resolveIdentityDocumentKindFromPaths(
  rectoPath: string,
  versoPath: string
): IdentityDocumentKind {
  const recto = inferIdentityDocumentKindFromPath(rectoPath);
  const verso = inferIdentityDocumentKindFromPath(versoPath);
  if (recto === "passport" || verso === "passport") return "passport";
  if (recto === "cni" || verso === "cni") return "cni";
  return "cni";
}

export type ImageLayoutHint = "portrait_stacked" | "landscape" | "squareish";

export function classifyImageLayout(image: { width: number; height: number }): ImageLayoutHint {
  const ratio = image.width / Math.max(image.height, 1);
  if (ratio > 1.12) return "landscape";
  if (ratio < 0.88) return "portrait_stacked";
  return "squareish";
}

/** Nom de fichier prioritaire ; sinon heuristique forme. */
export function refineIdentityDocumentKind(
  hinted: IdentityDocumentKind | undefined,
  image: { width: number; height: number }
): IdentityDocumentKind {
  if (hinted) return hinted;
  if (classifyImageLayout(image) === "landscape") return "passport";
  return "cni";
}

/** CNI scannée recto | verso côte à côte (scanner paysage). */
export function isLikelyCniSideBySideScan(
  kind: IdentityDocumentKind,
  image: { width: number; height: number }
): boolean {
  return kind === "cni" && classifyImageLayout(image) === "landscape";
}

export function getImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.width, height: img.height });
    img.onerror = () => reject(new Error("Image illisible"));
    img.src = dataUrl;
  });
}
