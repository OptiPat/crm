import type { NewsletterLayout } from "@/lib/api/tauri-newsletter";

export type { NewsletterLayout };

export const DEFAULT_NEWSLETTER_ACCENT = "#0f2744";
export const DEFAULT_NEWSLETTER_SECONDARY = "#b8956a";
export const DEFAULT_NEWSLETTER_TEXT = "#2d3748";
export const DEFAULT_NEWSLETTER_HEADER_TEXT = "#ffffff";

export const NEWSLETTER_LAYOUT_OPTIONS: { id: NewsletterLayout; label: string; hint: string }[] = [
  {
    id: "magazine",
    label: "Magazine (défaut)",
    hint: "Sections numérotées, mise en page éditoriale",
  },
  {
    id: "minimal",
    label: "Minimal",
    hint: "Épuré, sans numéros de section",
  },
  {
    id: "alert",
    label: "Alerte / échéance",
    hint: "CTA renforcé, sections plus directes",
  },
  {
    id: "single",
    label: "Une actu",
    hint: "Compact, une information principale",
  },
];

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

export function normalizeHexColor(value: string | null | undefined, fallback: string): string {
  const trimmed = value?.trim() ?? "";
  return HEX_COLOR.test(trimmed) ? trimmed : fallback;
}

export interface NewsletterColorInput {
  headerColor?: string | null;
  headerTextColor?: string | null;
  titleColor?: string | null;
  separatorColor?: string | null;
  textColor?: string | null;
  buttonColor?: string | null;
  /** @deprecated Rétrocompat — en-tête / titres / boutons si couleurs détaillées absentes */
  accentColor?: string | null;
  /** @deprecated Rétrocompat — séparateurs si separatorColor absent */
  secondaryColor?: string | null;
}

export interface ResolvedNewsletterColors {
  headerColor: string;
  headerTextColor: string;
  titleColor: string;
  separatorColor: string;
  textColor: string;
  buttonColor: string;
}

export type NewsletterPalette = ResolvedNewsletterColors;

export function resolveNewsletterColors(
  input?: NewsletterColorInput | null
): ResolvedNewsletterColors {
  const legacyAccent = normalizeHexColor(input?.accentColor, DEFAULT_NEWSLETTER_ACCENT);
  const legacySecondary = normalizeHexColor(input?.secondaryColor, DEFAULT_NEWSLETTER_SECONDARY);
  return {
    headerColor: normalizeHexColor(input?.headerColor, legacyAccent),
    headerTextColor: normalizeHexColor(
      input?.headerTextColor,
      DEFAULT_NEWSLETTER_HEADER_TEXT
    ),
    titleColor: normalizeHexColor(input?.titleColor, legacyAccent),
    separatorColor: normalizeHexColor(input?.separatorColor, legacySecondary),
    textColor: normalizeHexColor(input?.textColor, DEFAULT_NEWSLETTER_TEXT),
    buttonColor: normalizeHexColor(input?.buttonColor, legacyAccent),
  };
}

export function resolveNewsletterBranding(input?: {
  accentColor?: string | null;
  secondaryColor?: string | null;
  layout?: NewsletterLayout | null;
}): { accentColor: string; secondaryColor: string; layout: NewsletterLayout } {
  return {
    accentColor: normalizeHexColor(input?.accentColor, DEFAULT_NEWSLETTER_ACCENT),
    secondaryColor: normalizeHexColor(input?.secondaryColor, DEFAULT_NEWSLETTER_SECONDARY),
    layout: input?.layout ?? "magazine",
  };
}
