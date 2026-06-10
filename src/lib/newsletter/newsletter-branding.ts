import type { NewsletterLayout } from "@/lib/api/tauri-newsletter";

export type { NewsletterLayout };

export const DEFAULT_NEWSLETTER_ACCENT = "#0f2744";
export const DEFAULT_NEWSLETTER_SECONDARY = "#b8956a";

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
