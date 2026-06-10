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
`.trim();
