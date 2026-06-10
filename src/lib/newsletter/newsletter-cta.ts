import type { GeneratedNewsletterContent } from "@/lib/api/tauri-newsletter";

export type ResolvedNewsletterCtaMode = "none" | "text" | "button";

export interface ResolvedNewsletterCta {
  mode: ResolvedNewsletterCtaMode;
  /** Bloc texte encadré (sans bouton) */
  text?: string;
  buttonLabel?: string;
  buttonHref?: string;
  /** Phrase d'intro au-dessus du bouton (CTA explicite avec texte distinct) */
  introAboveButton?: string;
  /** Le bouton agenda a déjà été utilisé comme CTA — ne pas dupliquer */
  agendaConsumed: boolean;
}

const RDV_PATTERN =
  /\b(rendez[- ]vous|rdv|cr[eé]neau|calendrier|prendre rendez|prenez rendez|planifier un appel|échangeons|discutons)\b/i;

export function isRdvLikeCtaText(text: string): boolean {
  return RDV_PATTERN.test(text.trim());
}

function normalizeCompare(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function urlsMatch(a: string, b: string): boolean {
  return normalizeCompare(a.replace(/^https?:\/\//i, "")) === normalizeCompare(b.replace(/^https?:\/\//i, ""));
}

/** Résout le rendu CTA (texte, bouton, fusion agenda) pour le HTML newsletter. */
export function resolveNewsletterCta(
  content: GeneratedNewsletterContent,
  options: { agendaUrl?: string | null }
): ResolvedNewsletterCta {
  const none: ResolvedNewsletterCta = { mode: "none", agendaConsumed: false };
  if (content.includeCta === false) return none;

  const ctaText = content.cta?.trim() ?? "";
  const ctaUrl = content.ctaUrl?.trim();
  const ctaLabel = content.ctaLabel?.trim();
  const agendaUrl = options.agendaUrl?.trim();

  if (ctaUrl) {
    const label =
      ctaLabel ||
      (ctaText ? ctaText.split("\n")[0]!.slice(0, 80) : "") ||
      "En savoir plus";
    const introAboveButton =
      ctaText &&
      normalizeCompare(ctaText) !== normalizeCompare(label) &&
      !isRdvLikeCtaText(ctaText)
        ? ctaText
        : undefined;
    return {
      mode: "button",
      buttonLabel: label,
      buttonHref: ctaUrl,
      introAboveButton,
      agendaConsumed: Boolean(agendaUrl && urlsMatch(ctaUrl, agendaUrl)),
    };
  }

  if (agendaUrl && ctaText && isRdvLikeCtaText(ctaText)) {
    return {
      mode: "button",
      buttonLabel: ctaLabel || "Prendre rendez-vous",
      buttonHref: agendaUrl,
      agendaConsumed: true,
    };
  }

  if (agendaUrl && ctaLabel && !ctaText) {
    return {
      mode: "button",
      buttonLabel: ctaLabel,
      buttonHref: agendaUrl,
      agendaConsumed: true,
    };
  }

  if (ctaText) {
    return { mode: "text", text: ctaText, agendaConsumed: false };
  }

  return none;
}

/** Afficher le bloc agenda / réponse email en fin de mail. */
export function shouldShowNewsletterAgendaBlock(
  content: GeneratedNewsletterContent,
  options: { agendaUrl?: string | null; cgpEmail?: string | null },
  resolved: ResolvedNewsletterCta
): boolean {
  if (content.includeCta === false) return false;
  const hasAgenda = Boolean(options.agendaUrl?.trim()) && !resolved.agendaConsumed;
  const hasReply = Boolean(options.cgpEmail?.trim());
  return hasAgenda || hasReply;
}
