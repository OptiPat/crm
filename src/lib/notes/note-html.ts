import { MAX_NOTE_IMAGE_EMBED_BYTES } from "@/lib/notes/note-image-import";

const ALLOWED_NOTE_TAGS = new Set([
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "ul",
  "ol",
  "li",
  "a",
  "div",
  "span",
  "img",
]);

const NOTE_SAFE_STYLE_VALUES: Record<string, RegExp> = {
  "line-height": /^[\d.]+$/,
  margin: /^0(px)?$/,
  padding: /^0(px)?$/,
  "padding-left": /^1\.25em$/,
  "font-weight": /^(700|bold|600|bolder)$/,
  "font-style": /^italic$/,
  "text-decoration": /^underline$/,
  color: /^#[0-9a-f]{3}([0-9a-f]{3})?$/i,
  "background-color": /^#[0-9a-f]{3}([0-9a-f]{3})?$/i,
  "font-size": /^(\d+(\.\d+)?px|\d+(\.\d+)?em)$/,
  "max-width": /^100%$/,
  height: /^auto$/,
  display: /^block$/,
};

const NOTE_RGB_COLOR =
  /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(0|1|0?\.\d+))?\s*\)$/i;

function isSafeNoteRgbColor(value: string): boolean {
  const m = NOTE_RGB_COLOR.exec(value.trim());
  if (!m) return false;
  for (let i = 1; i <= 3; i++) {
    const n = Number(m[i]);
    if (!Number.isFinite(n) || n < 0 || n > 255) return false;
  }
  return true;
}

function isSafeNoteColorValue(prop: string, value: string): boolean {
  const re = NOTE_SAFE_STYLE_VALUES[prop];
  if (re?.test(value)) return true;
  if (prop === "color" || prop === "background-color") {
    return isSafeNoteRgbColor(value);
  }
  return false;
}

function isSafeNoteStyleDecl(prop: string, value: string): boolean {
  if (prop === "background") {
    return isSafeNoteColorValue("background-color", value);
  }
  if (prop === "color" || prop === "background-color") {
    return isSafeNoteColorValue(prop, value);
  }
  const re = NOTE_SAFE_STYLE_VALUES[prop];
  return re != null && re.test(value);
}

/** Conserve les déclarations sûres ; ignore le reste au lieu de rejeter tout le style. */
function filterSafeStyleDeclarations(style: string): string | null {
  const s = style.replace(/\s/g, "").toLowerCase();
  if (s === "line-height:1.5;margin:0;padding:0") return style;
  if (s === "margin:0;padding-left:1.25em;line-height:1.5") return style;
  if (s === "margin:0;padding:0;line-height:1.5") return style;
  if (s === "max-width:100%;height:auto;display:block") return style;
  if (s === "max-width:100%;height:auto") return style;

  const kept: string[] = [];
  for (const decl of style.split(";").map((d) => d.trim()).filter(Boolean)) {
    const colon = decl.indexOf(":");
    if (colon <= 0) continue;
    const prop = decl.slice(0, colon).trim().toLowerCase();
    const value = decl.slice(colon + 1).trim();
    if (!isSafeNoteStyleDecl(prop, value)) continue;
    if (prop === "background") {
      kept.push(`background-color: ${value}`);
      continue;
    }
    kept.push(`${prop}: ${value}`);
  }
  return kept.length > 0 ? kept.join("; ") : null;
}

function dataUrlByteLength(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return dataUrl.length;
  const b64 = dataUrl.slice(comma + 1).replace(/\s/g, "");
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((b64.length * 3) / 4) - padding);
}

function isSafeNoteImageSrc(src: string): boolean {
  const s = src.trim();
  if (/^https?:\/\//i.test(s)) return true;
  if (!/^data:image\//i.test(s)) return false;
  return dataUrlByteLength(s) <= MAX_NOTE_IMAGE_EMBED_BYTES;
}

function isBoldFontWeight(value: string): boolean {
  const fw = value.trim().toLowerCase();
  if (fw === "bold" || fw === "bolder" || fw === "700" || fw === "600") return true;
  const n = Number.parseInt(fw, 10);
  return Number.isFinite(n) && n >= 600;
}

function extractFontWeightFromStyle(style: string): string | null {
  const m = /font-weight\s*:\s*([^;]+)/i.exec(style);
  return m ? m[1]!.trim() : null;
}

function promoteBoldStyleSpansToSemanticTags(root: Element): void {
  for (const el of [...root.querySelectorAll("span[style]")]) {
    const fw = extractFontWeightFromStyle(el.getAttribute("style") ?? "");
    if (!fw || !isBoldFontWeight(fw)) continue;
    const b = root.ownerDocument.createElement("b");
    b.innerHTML = el.innerHTML;
    el.replaceWith(b);
  }
}

/** execCommand foreColor produit parfois <font color="…"> — convertir en span. */
function convertFontTagsToSpans(root: Element): void {
  for (const font of [...root.querySelectorAll("font")]) {
    const span = root.ownerDocument.createElement("span");
    const color = font.getAttribute("color")?.trim();
    if (color) {
      const filtered = filterSafeStyleDeclarations(`color: ${color}`);
      if (filtered) span.setAttribute("style", filtered);
    }
    span.innerHTML = font.innerHTML;
    font.replaceWith(span);
  }
}

const NOTE_LIST_STYLE = "margin:0;padding-left:1.25em;line-height:1.5";
const NOTE_LIST_ITEM_STYLE = "margin:0;padding:0;line-height:1.5";

function normalizeNoteLists(root: Element): void {
  for (const list of root.querySelectorAll("ul, ol")) {
    list.setAttribute("style", NOTE_LIST_STYLE);
    for (const child of [...list.children]) {
      if (child.tagName.toLowerCase() === "li") {
        child.setAttribute("style", NOTE_LIST_ITEM_STYLE);
      }
    }
  }
}

function sanitizeNoteHtmlNode(el: Element): void {
  const children = [...el.children];
  for (const child of children) {
    const tag = child.tagName.toLowerCase();
    if (tag === "img") {
      const src = child.getAttribute("src")?.trim() ?? "";
      if (!isSafeNoteImageSrc(src)) {
        child.remove();
        continue;
      }
      for (const attr of [...child.attributes]) {
        if (
          attr.name === "src" ||
          attr.name === "alt" ||
          attr.name === "width" ||
          attr.name === "height"
        ) {
          continue;
        }
        if (attr.name === "style") {
          const filtered = filterSafeStyleDeclarations(attr.value);
          if (filtered) child.setAttribute("style", filtered);
          else child.removeAttribute("style");
          continue;
        }
        child.removeAttribute(attr.name);
      }
      continue;
    }
    if (!ALLOWED_NOTE_TAGS.has(tag)) {
      while (child.firstChild) {
        el.insertBefore(child.firstChild, child);
      }
      el.removeChild(child);
      continue;
    }
    for (const attr of [...child.attributes]) {
      if (tag === "a" && attr.name === "href") {
        const href = attr.value.trim();
        if (!/^https?:\/\//i.test(href) && !/^mailto:/i.test(href)) {
          child.removeAttribute("href");
        }
        continue;
      }
      if (tag === "div" && attr.name === "dir" && attr.value === "ltr") {
        continue;
      }
      if (attr.name === "style") {
        const filtered = filterSafeStyleDeclarations(attr.value);
        if (filtered) child.setAttribute("style", filtered);
        else child.removeAttribute("style");
        continue;
      }
      child.removeAttribute(attr.name);
    }
    sanitizeNoteHtmlNode(child);
  }
}

/** Sanitise le HTML des notes : mise en forme + couleurs + images locales/https. */
export function sanitizeNoteHtml(html: string): string {
  const trimmed = html.trim();
  if (!trimmed) return "";
  if (typeof DOMParser === "undefined") {
    return trimmed
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(
        /<span\b([^>]*?\sstyle="[^"]*font-weight\s*:\s*(?:bold|bolder|700|600)[^"]*"[^>]*)>([\s\S]*?)<\/span>/gi,
        "<b>$2</b>"
      )
      .replace(
        /<font\s+color="([^"]*)"[^>]*>([\s\S]*?)<\/font>/gi,
        (_full, color: string, inner: string) => {
          const filtered = filterSafeStyleDeclarations(`color: ${color}`);
          return filtered ? `<span style="${filtered}">${inner}</span>` : inner;
        }
      )
      .replace(/\sstyle="([^"]*)"/gi, (_full, style: string) => {
        const filtered = filterSafeStyleDeclarations(style);
        return filtered ? ` style="${filtered}"` : "";
      })
      .replace(/\sstyle='([^']*)'/gi, (_full, style: string) => {
        const filtered = filterSafeStyleDeclarations(style);
        return filtered ? ` style="${filtered}"` : "";
      })
      .replace(/<ul(\s[^>]*)?>/gi, `<ul style="${NOTE_LIST_STYLE}">`)
      .replace(/<ol(\s[^>]*)?>/gi, `<ol style="${NOTE_LIST_STYLE}">`)
      .replace(/<li(\s[^>]*)?>/gi, `<li style="${NOTE_LIST_ITEM_STYLE}">`)
      .replace(/<img\b[^>]*>/gi, (tag) => {
        const srcMatch = /\ssrc=["']([^"']+)["']/i.exec(tag);
        const src = srcMatch?.[1] ?? "";
        return src && isSafeNoteImageSrc(src) ? tag : "";
      });
  }
  const doc = new DOMParser().parseFromString(trimmed, "text/html");
  convertFontTagsToSpans(doc.body);
  promoteBoldStyleSpansToSemanticTags(doc.body);
  sanitizeNoteHtmlNode(doc.body);
  normalizeNoteLists(doc.body);
  for (const img of [...doc.body.querySelectorAll("img")]) {
    const src = img.getAttribute("src")?.trim() ?? "";
    if (!isSafeNoteImageSrc(src)) img.remove();
  }
  return doc.body.innerHTML.trim();
}
