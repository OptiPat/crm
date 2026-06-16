/**
 * Reconstruction spatiale du texte PDF.js (lignes + colonnes).
 * Remplace le join(" ") naïf qui fusionne les cellules de tableaux Stellium.
 */

export interface PdfTextItemLike {
  str: string;
  transform?: number[];
  width?: number;
  height?: number;
}

interface PositionedItem {
  str: string;
  x: number;
  y: number;
  width: number;
}

const LINE_Y_TOLERANCE = 3;
const COLUMN_GAP_MIN = 14;
const WORD_GAP_MAX = 6;

function itemX(item: PdfTextItemLike): number {
  return item.transform?.[4] ?? 0;
}

function itemY(item: PdfTextItemLike): number {
  return item.transform?.[5] ?? 0;
}

function itemWidth(item: PdfTextItemLike): number {
  if (item.width != null && item.width > 0) return item.width;
  return Math.max(item.str.length * 4, 1);
}

function gapSeparator(gap: number): string {
  if (gap >= COLUMN_GAP_MIN) return "\t";
  if (gap > WORD_GAP_MAX) return "   ";
  if (gap > 1.5) return " ";
  return "";
}

/** Regroupe les items d'une page en lignes triées (haut → bas). */
export function groupPdfTextItemsIntoLines(items: PdfTextItemLike[]): string[] {
  const positioned: PositionedItem[] = [];

  for (const item of items) {
    const str = item.str?.replace(/\s+/g, " ").trim();
    if (!str) continue;
    positioned.push({
      str,
      x: itemX(item),
      y: itemY(item),
      width: itemWidth(item),
    });
  }

  if (positioned.length === 0) return [];

  positioned.sort((a, b) => {
    const dy = b.y - a.y;
    if (Math.abs(dy) > LINE_Y_TOLERANCE) return dy;
    return a.x - b.x;
  });

  const lines: PositionedItem[][] = [];
  let currentLine: PositionedItem[] = [];
  let currentY: number | null = null;

  for (const item of positioned) {
    if (currentY == null || Math.abs(item.y - currentY) <= LINE_Y_TOLERANCE) {
      currentLine.push(item);
      currentY = currentY == null ? item.y : (currentY + item.y) / 2;
    } else {
      if (currentLine.length) lines.push(currentLine);
      currentLine = [item];
      currentY = item.y;
    }
  }
  if (currentLine.length) lines.push(currentLine);

  return lines.map((lineItems) => {
    const sorted = [...lineItems].sort((a, b) => a.x - b.x);
    let out = sorted[0]!.str;
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1]!;
      const cur = sorted[i]!;
      const gap = cur.x - (prev.x + prev.width);
      out += gapSeparator(gap) + cur.str;
    }
    return out;
  });
}

/** Assemble le texte d'une page à partir des items PDF.js. */
export function reconstructPageTextFromItems(items: PdfTextItemLike[]): string {
  return groupPdfTextItemsIntoLines(items).join("\n");
}

/**
 * Heuristique Stellium couple : si une ligne contient ≥2 montants € séparés par des tabulations,
 * on considère que la structure colonnes est préservée.
 */
export function lineHasStelliumColumnLayout(line: string): boolean {
  if (!line.includes("\t")) return false;
  const amounts = line.match(/[\d\s,]+ €/g);
  return (amounts?.length ?? 0) >= 2;
}

export function countStelliumColumnLines(text: string): number {
  return text.split("\n").filter(lineHasStelliumColumnLayout).length;
}
