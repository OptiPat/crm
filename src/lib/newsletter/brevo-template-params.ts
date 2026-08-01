import type { GeneratedNewsletterContent } from "@/lib/api/tauri-newsletter";
import {
  formatNewsletterBodyHtml,
  formatNewsletterSectionTitleHtml,
  newsletterFieldToPlain,
} from "@/lib/newsletter/newsletter-rich-text";

/** Variables attendues dans un template Brevo (syntaxe {{ params.NOM }}). */
export const BREVO_TEMPLATE_PARAM_HINTS = [
  {
    key: "CONTENT_HTML",
    label: "Corps HTML complet (intro + sections + CTA) — recommandé",
  },
  { key: "INTRO", label: "Introduction seule (legacy)" },
  { key: "EDITION_TITLE", label: "Titre éditorial du numéro" },
  { key: "PREHEADER", label: "Préheader (aperçu boîte mail)" },
  { key: "SECTION1_TITLE", label: "Titre section 1 (legacy)" },
  { key: "SECTION1_BODY", label: "Corps section 1 (legacy)" },
  { key: "SECTION2_TITLE", label: "Titre section 2 (legacy)" },
  { key: "SECTION2_BODY", label: "Corps section 2 (legacy)" },
  { key: "SECTION3_TITLE", label: "Titre section 3 (legacy)" },
  { key: "SECTION3_BODY", label: "Corps section 3 (legacy)" },
  { key: "CTA", label: "Appel à l'action seul (legacy)" },
  { key: "HIGHLIGHT_SECTION", label: "Numéro de section mise en avant (1-3)" },
] as const;

/** Retire un titre dupliqué en tête du corps (souvent renvoyé par l'IA). */
export function stripDuplicateSectionTitle(title: string, body: string): string {
  const titleKey = normalizeCompareKey(title);
  if (!titleKey) return body.trim();
  const bodyTrim = body.trim();
  if (!bodyTrim) return "";

  const lines = bodyTrim.split("\n");
  if (lines.length > 0 && normalizeCompareKey(lines[0] ?? "") === titleKey) {
    return lines.slice(1).join("\n").trimStart();
  }
  return bodyTrim;
}

function normalizeCompareKey(text: string): string {
  return newsletterFieldToPlain(text).toLowerCase().replace(/\s+/g, " ").trim();
}

/** Corps HTML injecté dans `{{ params.CONTENT_HTML }}` (aligné sur brevo.rs). */
export function buildBrevoContentHtml(content: GeneratedNewsletterContent): string {
  const parts: string[] = [];

  const introHtml = formatNewsletterBodyHtml(content.intro);
  if (introHtml) parts.push(`<p>${introHtml}</p>`);

  const sections = content.sections.slice(0, 3);
  const hasSections = sections.some((s) => s.title.trim() || s.body.trim());
  if (hasSections && parts.length > 0) parts.push("<hr />");

  for (const section of sections) {
    const titleHtml = formatNewsletterSectionTitleHtml(section.title);
    if (titleHtml) parts.push(`<h2 style="font-weight:700;">${titleHtml}</h2>`);
    const bodyClean = stripDuplicateSectionTitle(section.title, section.body);
    const bodyHtml = formatNewsletterBodyHtml(bodyClean);
    if (bodyHtml) parts.push(`<p>${bodyHtml}</p>`);
  }

  const ctaHtml = formatNewsletterBodyHtml(content.cta ?? "");
  if (ctaHtml) {
    if (parts.length > 0) parts.push("<hr />");
    parts.push(`<p>${ctaHtml}</p>`);
  }

  return parts.join("\n");
}

export function buildBrevoTemplateParams(
  content: GeneratedNewsletterContent
): Record<string, string> {
  const params: Record<string, string> = {};

  const set = (key: string, value?: string | null) => {
    const trimmed = value?.trim();
    if (trimmed) params[key] = trimmed;
  };

  const contentHtml = buildBrevoContentHtml(content);
  if (contentHtml) params.CONTENT_HTML = contentHtml;

  set("INTRO", content.intro);
  set("EDITION_TITLE", content.editionTitle);
  set("PREHEADER", content.preheader);
  set("CTA", content.cta);

  content.sections.slice(0, 3).forEach((section, index) => {
    const n = index + 1;
    set(`SECTION${n}_TITLE`, section.title);
    set(`SECTION${n}_BODY`, stripDuplicateSectionTitle(section.title, section.body));
    if (section.highlight) {
      params.HIGHLIGHT_SECTION = String(n);
    }
  });

  return params;
}
