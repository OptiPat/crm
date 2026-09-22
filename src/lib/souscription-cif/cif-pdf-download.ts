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

const HAS_MODERN_COLOR =
  /oklch\(|oklab\(|color-mix\(|light-dark\(|(?<![\w-])(?:lab|lch|color)\(/i;

/** Pose en style inline toute valeur calculée que html2canvas ne sait pas lire. */
export function inlineModernColors(root: HTMLElement): void {
  const ctx = root.ownerDocument.createElement("canvas").getContext("2d");
  const view = root.ownerDocument.defaultView;
  if (!view) return;
  const nodes = [root, ...root.querySelectorAll<HTMLElement>("*")];
  for (const node of nodes) {
    const computed = view.getComputedStyle(node);
    const props: string[] = [];
    for (let index = 0; index < computed.length; index++) props.push(computed.item(index));
    for (const prop of props) {
      const value = computed.getPropertyValue(prop);
      if (!value || !HAS_MODERN_COLOR.test(value)) continue;
      node.style.setProperty(
        prop,
        replaceModernColorFunctions(value, (fn) => rgbFromCssColor(fn, ctx)),
        "important"
      );
    }
  }
}

/** Réécrit le CSS brut et désactive les feuilles liées qui contiennent encore oklch. */
export function neutralizeModernColorSheets(doc: Document): void {
  const ctx = doc.createElement("canvas").getContext("2d");
  const toRgb = (fn: string) => rgbFromCssColor(fn, ctx);
  const rewrite = (css: string) => replaceModernColorFunctions(css, toRgb);

  doc.querySelectorAll("style").forEach((style) => {
    const text = style.textContent;
    if (!text || !HAS_MODERN_COLOR.test(text)) return;
    style.textContent = rewrite(text);
  });

  doc.querySelectorAll<HTMLElement>("[style]").forEach((element) => {
    const style = element.getAttribute("style");
    if (!style || !HAS_MODERN_COLOR.test(style)) return;
    element.setAttribute("style", rewrite(style));
  });

  for (const sheet of [...doc.styleSheets]) {
    const owner = sheet.ownerNode;
    if (owner instanceof HTMLElement && owner.dataset.cifColorSafe === "true") continue;
    let css = "";
    try {
      css = [...sheet.cssRules].map((rule) => rule.cssText).join("\n");
    } catch {
      continue;
    }
    if (!HAS_MODERN_COLOR.test(css)) continue;
    const style = doc.createElement("style");
    style.dataset.cifColorSafe = "true";
    style.textContent = rewrite(css);
    sheet.disabled = true;
    doc.head?.appendChild(style);
  }
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
          neutralizeModernColorSheets(clonedDocument);
          if (!(clonedElement instanceof HTMLElement)) return;
          clearMissingVariableMarks(clonedElement);
          inlineModernColors(clonedElement);
        },
      });
      appendCanvasPages(doc, canvas, isFirst);
    }
  } finally {
    if (!previousClass) document.documentElement.classList.remove(CAPTURE_CLASS);
  }

  return new Uint8Array(doc.output("arraybuffer"));
}
