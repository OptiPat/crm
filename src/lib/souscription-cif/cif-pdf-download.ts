import { jsPDF } from "jspdf";

/** Pages A4 du portail, y compris le repli si Paged.js a échoué. */
export const CIF_PDF_PAGE_SELECTOR = ".cif-print-page, .pagedjs_page, .cif-print-fallback";

const CAPTURE_CLASS = "cif-pdf-capture";
const A4_HEIGHT_OVER_WIDTH = 297 / 210;

/** Nombre de pages A4 pour une image. Une page déjà au format A4 reste une page. */
export function a4SliceCount(width: number, height: number): number {
  if (width <= 0 || height <= 0) return 1;
  const sliceHeight = width * A4_HEIGHT_OVER_WIDTH;
  if (height <= sliceHeight * 1.05) return 1;
  return Math.ceil(height / sliceHeight);
}

export function listCifPdfPageElements(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(CIF_PDF_PAGE_SELECTOR));
}

const COLOR_FN = /(?<![\w-])(?:oklch|oklab|color-mix|light-dark|lab|lch|color)\(/gi;

/** Remplace oklch / color-mix (Tailwind 4) : html2canvas 1.4 plante dessus. */
export function replaceModernColorFunctions(
  css: string,
  toRgb: (fn: string) => string
): string {
  COLOR_FN.lastIndex = 0;
  let result = "";
  let last = 0;
  for (const match of css.matchAll(COLOR_FN)) {
    const start = match.index ?? 0;
    if (start < last) continue;
    let depth = 1;
    let cursor = start + match[0].length;
    while (cursor < css.length && depth > 0) {
      if (css[cursor] === "(") depth += 1;
      else if (css[cursor] === ")") depth -= 1;
      cursor += 1;
    }
    result += css.slice(last, start) + toRgb(css.slice(start, cursor));
    last = cursor;
  }
  return result + css.slice(last);
}

function rgbFromCssColor(fn: string, ctx: CanvasRenderingContext2D | null): string {
  if (!ctx) return "#000000";
  try {
    ctx.fillStyle = "#000000";
    ctx.fillStyle = fn;
    const out = String(ctx.fillStyle);
    if (/okl|\blab\(|\blch\(|color-mix|light-dark|\bcolor\(/i.test(out)) return "#000000";
    return out;
  } catch {
    return "#000000";
  }
}

/** Réécrit les feuilles du clone avant qu'html2canvas ne lise les couleurs. */
export function sanitizeClonedDocumentColors(doc: Document): void {
  const ctx = doc.createElement("canvas").getContext("2d");
  const toRgb = (fn: string) => rgbFromCssColor(fn, ctx);
  for (const sheet of [...doc.styleSheets]) {
    let css = "";
    try {
      css = [...sheet.cssRules].map((rule) => rule.cssText).join("\n");
    } catch {
      continue;
    }
    if (!COLOR_FN.test(css)) continue;
    COLOR_FN.lastIndex = 0;
    const style = doc.createElement("style");
    style.textContent = replaceModernColorFunctions(css, toRgb);
    sheet.disabled = true;
    doc.head?.appendChild(style);
  }
}
function canvasColor(value: string, ctx: CanvasRenderingContext2D): string | null {
  if (!value || value === "transparent") return null;
  if (!/okl|color\(/i.test(value)) return null;
  ctx.fillStyle = "#000000";
  ctx.fillStyle = value;
  return ctx.fillStyle;
}

/** Même rendu que l'impression Windows : pas de surlignage ambre des variables manquantes. */
function clearMissingVariableMarks(root: HTMLElement): void {
  root.querySelectorAll("mark").forEach((node) => {
    const mark = node as HTMLElement;
    mark.style.background = "transparent";
    mark.style.backgroundColor = "transparent";
    mark.style.padding = "0";
    mark.style.color = "inherit";
  });
}

function inlineUnsupportedColors(root: HTMLElement): void {
  const ctx = root.ownerDocument.createElement("canvas").getContext("2d");
  if (!ctx) return;
  const props = [
    "color",
    "background-color",
    "border-top-color",
    "border-right-color",
    "border-bottom-color",
    "border-left-color",
  ] as const;
  const nodes = [root, ...root.querySelectorAll<HTMLElement>("*")];
  for (const node of nodes) {
    const computed = node.ownerDocument.defaultView?.getComputedStyle(node);
    if (!computed) continue;
    for (const prop of props) {
      const next = canvasColor(computed.getPropertyValue(prop), ctx);
      if (next) node.style.setProperty(prop, next);
    }
  }
}

function appendCanvasPages(doc: jsPDF, canvas: HTMLCanvasElement, isFirst: { value: boolean }): void {
  const sliceHeight = Math.max(1, Math.round(canvas.width * A4_HEIGHT_OVER_WIDTH));
  const slices = a4SliceCount(canvas.width, canvas.height);
  for (let slice = 0; slice < slices; slice++) {
    const offset = slice * sliceHeight;
    const chunk = document.createElement("canvas");
    chunk.width = canvas.width;
    chunk.height = sliceHeight;
    const ctx = chunk.getContext("2d");
    if (!ctx) continue;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, chunk.width, chunk.height);
    ctx.drawImage(
      canvas,
      0,
      offset,
      canvas.width,
      Math.min(sliceHeight, canvas.height - offset),
      0,
      0,
      canvas.width,
      Math.min(sliceHeight, canvas.height - offset)
    );
    if (!isFirst.value) doc.addPage();
    isFirst.value = false;
    doc.addImage(chunk.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, 210, 297);
  }
}

/** PDF des pages déjà paginées. Écrit ensuite dans Téléchargements, sans boîte d'impression. */
export async function renderCifPortalPdf(root: HTMLElement): Promise<Uint8Array> {
  const pages = listCifPdfPageElements(root);
  if (pages.length === 0) {
    throw new Error("Aucune page à télécharger.");
  }

  const html2canvas = (await import("html2canvas")).default;
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const isFirst = { value: true };
  const previousClass = document.documentElement.classList.contains(CAPTURE_CLASS);
  document.documentElement.classList.add(CAPTURE_CLASS);
  try {
    for (let index = 0; index < pages.length; index++) {
      const page = pages[index]!;
      const canvas = await html2canvas(page, {
        scale: 2,
        backgroundColor: "#ffffff",
        logging: false,
        useCORS: true,
        onclone: (clonedDocument, clonedElement) => {
          sanitizeClonedDocumentColors(clonedDocument);
          if (!(clonedElement instanceof HTMLElement)) return;
          clearMissingVariableMarks(clonedElement);
          inlineUnsupportedColors(clonedElement);
        },
      });
      appendCanvasPages(doc, canvas, isFirst);
    }
  } finally {
    if (!previousClass) document.documentElement.classList.remove(CAPTURE_CLASS);
  }

  return new Uint8Array(doc.output("arraybuffer"));
}
