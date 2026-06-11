import {
  htmlToPlainEmail,
  looksLikeHtml,
  sanitizeTemplateEmailHtml,
} from "@/lib/emails/template-email-html";
import type { ResolvedNewsletterTypography } from "@/lib/newsletter/newsletter-typography";

const BODY_COLOR = "#2d3748";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Texte brut pour template / export (compatible contenu historique sans HTML). */
export function newsletterFieldToPlain(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (looksLikeHtml(trimmed)) return htmlToPlainEmail(trimmed);
  return trimmed;
}

function flattenEditorHtmlToInline(html: string): string {
  const stripOuterBlock = (input: string) => {
    let out = input.trim();
    for (let i = 0; i < 3; i++) {
      const next = out
        .replace(/^<div[^>]*>([\s\S]*)<\/div>$/i, "$1")
        .replace(/^<p[^>]*>([\s\S]*)<\/p>$/i, "$1")
        .trim();
      if (next === out) break;
      out = next;
    }
    return out;
  };

  if (typeof DOMParser === "undefined") {
    return stripOuterBlock(html);
  }
  const doc = new DOMParser().parseFromString(html, "text/html");

  const appendInline = (source: Node, target: Element): void => {
    for (const child of [...source.childNodes]) {
      if (child.nodeType === Node.TEXT_NODE) {
        target.appendChild(child.cloneNode());
        continue;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) continue;
      const el = child as Element;
      const tag = el.tagName.toLowerCase();
      if (tag === "br") {
        target.appendChild(doc.createElement("br"));
        continue;
      }
      if (tag === "div" || tag === "p") {
        appendInline(el, target);
        continue;
      }
      if (["b", "strong", "i", "em", "u", "a", "span"].includes(tag)) {
        const clone = el.cloneNode(false) as Element;
        target.appendChild(clone);
        appendInline(el, clone);
        continue;
      }
      appendInline(el, target);
    }
  };

  const wrap = doc.createElement("div");
  appendInline(doc.body, wrap);
  return wrap.innerHTML.trim();
}

function enhanceInlineFormatting(html: string): string {
  if (typeof DOMParser === "undefined") return html;
  const doc = new DOMParser().parseFromString(html, "text/html");
  for (const el of doc.querySelectorAll("b, strong")) {
    el.setAttribute("style", "font-weight:700;");
  }
  for (const el of doc.querySelectorAll("i, em")) {
    el.setAttribute("style", "font-style:italic;");
  }
  for (const el of doc.querySelectorAll("u")) {
    el.setAttribute("style", "text-decoration:underline;");
  }
  for (const el of doc.querySelectorAll("a[href]")) {
    el.setAttribute("style", "color:inherit;text-decoration:underline;");
  }
  for (const el of doc.querySelectorAll("ul, ol")) {
    el.setAttribute("style", "margin:0 0 0 1.25em;padding:0;");
  }
  for (const el of doc.querySelectorAll("li")) {
    el.setAttribute("style", "margin:0 0 0.35em 0;");
  }
  for (const el of doc.querySelectorAll("span[style*='font-size']")) {
    const fs = (el as HTMLElement).style.fontSize?.trim();
    if (fs && /^\d+(\.\d+)?px$/i.test(fs)) {
      el.setAttribute("style", `font-size:${fs};color:inherit;`);
    }
  }
  return doc.body.innerHTML.trim();
}

/** HTML corps newsletter (intro, section, CTA, blocs) — conserve gras / italique / souligné. */
export function formatNewsletterBodyHtml(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (looksLikeHtml(trimmed)) {
    return enhanceInlineFormatting(sanitizeTemplateEmailHtml(trimmed));
  }
  return escapeHtml(trimmed).replace(/\n/g, "<br>");
}

/** HTML titre de section — inline uniquement (conserve le style titre parent en email). */
export function formatNewsletterSectionTitleHtml(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (looksLikeHtml(trimmed)) {
    const sanitized = sanitizeTemplateEmailHtml(trimmed);
    return enhanceInlineFormatting(flattenEditorHtmlToInline(sanitized));
  }
  return escapeHtml(trimmed);
}

export function newsletterBodyTextStyle(typo: ResolvedNewsletterTypography): string {
  return `margin:0;font-family:${typo.bodyFontFamily};font-size:${typo.bodyFontSize};line-height:${typo.lineHeight};color:${BODY_COLOR};`;
}

export const NEWSLETTER_RICH_TEXT_CSS = `
.nl-rich-text b, .nl-rich-text strong { font-weight: 700; }
.nl-rich-text i, .nl-rich-text em { font-style: italic; }
.nl-rich-text u { text-decoration: underline; }
.nl-rich-text ul { margin: 0 0 0 1.25em; padding: 0; }
.nl-rich-text ol { margin: 0 0 0 1.25em; padding: 0; }
.nl-rich-text li { margin: 0 0 0.35em 0; }
.nl-rich-text a { color: inherit; text-decoration: underline; }
.nl-section-title b, .nl-section-title strong { font-weight: 700; color: inherit; }
.nl-section-title i, .nl-section-title em { font-style: italic; }
.nl-section-title u { text-decoration: underline; }
.nl-section-title span[style*="font-size"] { display: inline; line-height: inherit; }
`.trim();
