export type NewsletterBodyFont = "classic" | "modern" | "system";
export type NewsletterTitleFont = "classic" | "modern";
export type NewsletterBodyFontSize = "sm" | "md" | "lg";
export type NewsletterLineHeight = "normal" | "relaxed";
export type NewsletterSectionSpacing = "compact" | "normal" | "airy";

export interface NewsletterTypographySettings {
  bodyFont?: NewsletterBodyFont | null;
  titleFont?: NewsletterTitleFont | null;
  bodyFontSize?: NewsletterBodyFontSize | null;
  lineHeight?: NewsletterLineHeight | null;
  sectionSpacing?: NewsletterSectionSpacing | null;
}

export interface ResolvedNewsletterTypography {
  bodyFontFamily: string;
  titleFontFamily: string;
  bodyFontSize: string;
  lineHeight: string;
  sectionPad: string;
  introPad: string;
  mobileBodyFontSize: string;
}

const BODY_FONTS: Record<NewsletterBodyFont, string> = {
  classic: "Georgia,'Times New Roman',Times,serif",
  modern: "Arial,Helvetica,sans-serif",
  system:
    "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif",
};

const TITLE_FONTS: Record<NewsletterTitleFont, string> = {
  classic: "Georgia,'Times New Roman',Times,serif",
  modern: "Arial,Helvetica,sans-serif",
};

const FONT_SIZES: Record<NewsletterBodyFontSize, { body: string; mobile: string }> = {
  sm: { body: "15px", mobile: "16px" },
  md: { body: "17px", mobile: "16px" },
  lg: { body: "19px", mobile: "18px" },
};

const LINE_HEIGHTS: Record<NewsletterLineHeight, string> = {
  normal: "1.6",
  relaxed: "1.75",
};

const SECTION_PAD: Record<NewsletterSectionSpacing, string> = {
  compact: "0 40px 16px 40px",
  normal: "0 40px 28px 40px",
  airy: "0 40px 36px 40px",
};

export const NEWSLETTER_BODY_FONT_OPTIONS: { id: NewsletterBodyFont; label: string }[] = [
  { id: "classic", label: "Classique (serif)" },
  { id: "modern", label: "Moderne (sans-serif)" },
  { id: "system", label: "Système (natif)" },
];

export const NEWSLETTER_TITLE_FONT_OPTIONS: { id: NewsletterTitleFont; label: string }[] = [
  { id: "classic", label: "Classique (serif)" },
  { id: "modern", label: "Moderne (sans-serif)" },
];

export const NEWSLETTER_FONT_SIZE_OPTIONS: { id: NewsletterBodyFontSize; label: string }[] = [
  { id: "sm", label: "Petite" },
  { id: "md", label: "Normale" },
  { id: "lg", label: "Grande" },
];

export const NEWSLETTER_LINE_HEIGHT_OPTIONS: { id: NewsletterLineHeight; label: string }[] = [
  { id: "normal", label: "Normal" },
  { id: "relaxed", label: "Aéré" },
];

export const NEWSLETTER_SECTION_SPACING_OPTIONS: {
  id: NewsletterSectionSpacing;
  label: string;
}[] = [
  { id: "compact", label: "Compact" },
  { id: "normal", label: "Normal" },
  { id: "airy", label: "Aéré" },
];

function pickBodyFont(value?: NewsletterBodyFont | null): NewsletterBodyFont {
  return value === "modern" || value === "system" ? value : "classic";
}

function pickTitleFont(value?: NewsletterTitleFont | null): NewsletterTitleFont {
  return value === "modern" ? "modern" : "classic";
}

function pickFontSize(value?: NewsletterBodyFontSize | null): NewsletterBodyFontSize {
  return value === "sm" || value === "lg" ? value : "md";
}

function pickLineHeight(value?: NewsletterLineHeight | null): NewsletterLineHeight {
  return value === "normal" ? "normal" : "relaxed";
}

function pickSectionSpacing(value?: NewsletterSectionSpacing | null): NewsletterSectionSpacing {
  return value === "compact" || value === "airy" ? value : "normal";
}

export function resolveNewsletterTypography(
  input?: NewsletterTypographySettings | null
): ResolvedNewsletterTypography {
  const bodyFont = pickBodyFont(input?.bodyFont);
  const titleFont = pickTitleFont(input?.titleFont);
  const bodyFontSize = pickFontSize(input?.bodyFontSize);
  const lineHeight = pickLineHeight(input?.lineHeight);
  const sectionSpacing = pickSectionSpacing(input?.sectionSpacing);
  const sizes = FONT_SIZES[bodyFontSize];

  return {
    bodyFontFamily: BODY_FONTS[bodyFont],
    titleFontFamily: TITLE_FONTS[titleFont],
    bodyFontSize: sizes.body,
    mobileBodyFontSize: sizes.mobile,
    lineHeight: LINE_HEIGHTS[lineHeight],
    sectionPad: SECTION_PAD[sectionSpacing],
    introPad: sectionSpacing === "compact" ? "28px 40px 8px 40px" : "36px 40px 12px 40px",
  };
}
