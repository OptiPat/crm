import { jsPDF } from "jspdf";
import {
  inlineModernColors,
  neutralizeModernColorSheets,
} from "@/lib/souscription-cif/cif-pdf-download";

/**
 * PDF A4 à partir d'un document HTML continu (note, rapport Coach, comparatif UC).
 *
 * macOS : `window.print()` ne fait rien (permission `core:webview:allow-print` absente)
 * et la fin du panneau d'impression n'est pas détectable de façon fiable. On capture
 * donc le portail d'impression (html2canvas) et on le découpe en pages, comme le CIF.
 */

/** Classe posée sur `<html>` pendant la capture : rend les portails visibles hors écran. */
export const PDF_CAPTURE_CLASS = "pdf-capture";

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const PAGE_MARGIN_Y_MM = 12;

/** Éléments entre lesquels une coupure de page ne tranche pas une ligne de texte. */
const BLOCK_SELECTOR =
  "p, li, tr, h1, h2, h3, h4, h5, h6, blockquote, pre, table, section, header, footer, ul, ol, hr, img, figure, article > div, section > div";

/**
 * Positions de coupure (bas de chaque page, en px CSS depuis le haut du document).
 * Coupe au dernier bas de bloc qui tient dans la page ; si aucun bloc ne remplit au
 * moins la moitié de la page (bloc géant), coupe net à la hauteur de page.
 */
export function computePageBreaks(
  blockBottoms: readonly number[],
  totalHeight: number,
  pageHeight: number
): number[] {
  if (totalHeight <= 0 || pageHeight <= 0) return [Math.max(totalHeight, 0)];
  const sorted = [...blockBottoms].sort((a, b) => a - b);
  const breaks: number[] = [];
  let start = 0;
  while (totalHeight - start > pageHeight + 0.5) {
    const limit = start + pageHeight;
    let cut = limit;
    for (const bottom of sorted) {
      if (bottom > limit) break;
      if (bottom >= start + pageHeight / 2) cut = bottom;
    }
    breaks.push(cut);
    start = cut;
  }
  breaks.push(totalHeight);
  return breaks;
}

/** Écart maximal (px CSS) entre la fin d'un bloc et le début du suivant pour couper au milieu. */
const MAX_GAP_PX = 60;

/**
 * Coupures sûres : milieu de l'espace blanc entre un bloc et le suivant. html2canvas
 * décale le texte de quelques pixels par rapport à la mise en page mesurée ; couper
 * pile au bas d'un bloc trancherait parfois la ligne suivante.
 */
export function safeCutPositions(
  blocks: readonly { top: number; bottom: number }[]
): number[] {
  const tops = blocks.map((block) => block.top).sort((a, b) => a - b);
  return blocks.map(({ bottom }) => {
    const nextTop = tops.find((top) => top >= bottom - 0.5);
    if (nextTop === undefined || nextTop - bottom > MAX_GAP_PX) return bottom;
    return (bottom + Math.max(nextTop, bottom)) / 2;
  });
}

function collectSafeCuts(root: HTMLElement): number[] {
  const origin = root.getBoundingClientRect().top;
  const blocks: { top: number; bottom: number }[] = [];
  root.querySelectorAll<HTMLElement>(BLOCK_SELECTOR).forEach((element) => {
    const rect = element.getBoundingClientRect();
    if (rect.height > 0) blocks.push({ top: rect.top - origin, bottom: rect.bottom - origin });
  });
  return safeCutPositions(blocks);
}

export async function renderElementToPdf(root: HTMLElement): Promise<Blob> {
  const html = root.ownerDocument.documentElement;
  const hadClass = html.classList.contains(PDF_CAPTURE_CLASS);
  html.classList.add(PDF_CAPTURE_CLASS);
  try {
    await root.ownerDocument.fonts?.ready;
    const widthPx = root.offsetWidth;
    const heightPx = root.scrollHeight;
    if (widthPx <= 0 || heightPx <= 0) {
      throw new Error("Document vide.");
    }

    const html2canvas = (await import("html2canvas")).default;
    const canvas = await html2canvas(root, {
      scale: 2,
      backgroundColor: "#ffffff",
      logging: false,
      useCORS: true,
      height: heightPx,
      windowHeight: Math.max(heightPx, window.innerHeight),
      onclone: (clonedDocument, clonedElement) => {
        neutralizeModernColorSheets(clonedDocument);
        if (clonedElement instanceof HTMLElement) inlineModernColors(clonedElement);
      },
    });

    const pageContentMm = A4_HEIGHT_MM - 2 * PAGE_MARGIN_Y_MM;
    const pageHeightPx = (widthPx * pageContentMm) / A4_WIDTH_MM;
    const breaks = computePageBreaks(collectSafeCuts(root), heightPx, pageHeightPx);
    const scale = canvas.height / heightPx;

    const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
    let start = 0;
    breaks.forEach((end, index) => {
      const sliceTop = Math.round(start * scale);
      const sliceHeight = Math.max(1, Math.round(end * scale) - sliceTop);
      const chunk = root.ownerDocument.createElement("canvas");
      chunk.width = canvas.width;
      chunk.height = sliceHeight;
      const ctx = chunk.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, chunk.width, chunk.height);
        ctx.drawImage(canvas, 0, sliceTop, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);
      }
      if (index > 0) doc.addPage();
      const heightMm = ((end - start) * A4_WIDTH_MM) / widthPx;
      doc.addImage(chunk.toDataURL("image/jpeg", 0.92), "JPEG", 0, PAGE_MARGIN_Y_MM, A4_WIDTH_MM, heightMm);
      start = end;
    });

    return doc.output("blob");
  } finally {
    if (!hadClass) html.classList.remove(PDF_CAPTURE_CLASS);
  }
}
