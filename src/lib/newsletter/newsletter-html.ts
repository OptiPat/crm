import type {
  GeneratedNewsletterContent,
  NewsletterImagePlacement,
  NewsletterLayout,
  NewsletterPlacedImage,
} from "@/lib/api/tauri-newsletter";

import type { CgpConfig } from "@/lib/api/tauri-settings";
import { resolveAgendaUrl } from "@/lib/emails/agenda-links";

import { replaceTemplateVariables } from "@/lib/api/tauri-templates-email";
import { blocksHtmlAt, normalizeNewsletterBlocks } from "@/lib/newsletter/newsletter-blocks";
import {
  formatCgpPostalAddress,
  shouldShowFooterAddress,
  shouldShowFooterPhone,
  shouldShowFooterSite,
} from "@/lib/newsletter/newsletter-footer-options";
import { resolveNewsletterBranding } from "@/lib/newsletter/newsletter-branding";
import { normalizeNewsletterImages, imagesMatching } from "@/lib/newsletter/newsletter-images";
import {
  resolveNewsletterCta,
  shouldShowNewsletterAgendaBlock,
} from "@/lib/newsletter/newsletter-cta";
import { placementMatches } from "@/lib/newsletter/newsletter-placement";
import {
  resolveNewsletterTypography,
  type NewsletterTypographySettings,
  type ResolvedNewsletterTypography,
} from "@/lib/newsletter/newsletter-typography";
import {
  formatNewsletterBodyHtml,
  formatNewsletterSectionTitleHtml,
  NEWSLETTER_RICH_TEXT_CSS,
  newsletterBodyTextStyle,
  newsletterFieldToPlain,
} from "@/lib/newsletter/newsletter-rich-text";

export const NEWSLETTER_TEMPLATE_META_KEY = "newsletter_html";

/** Point d'insertion de la signature CGP (avant le pied de page). */

export const NEWSLETTER_SIGNATURE_MARKER = "<!-- newsletter-signature -->";



export interface NewsletterTemplateMeta {

  newsletter_html: string;

}



export interface NewsletterHtmlOptions {

  cabinetName?: string;

  accentColor?: string;

  secondaryColor?: string;

  layout?: NewsletterLayout;

  agendaUrl?: string;

  /** Email conseiller — lien mailto « Se désinscrire » */

  unsubscribeEmail?: string;

  /** Logo cabinet en data URL (embarqué dans l'email). */

  logoDataUrl?: string;

  /** Ex. « juin 2026 » */

  editionLabel?: string;

  /** Preheader inbox — prioritaire sur content.preheader */

  preheader?: string;

  cgpPrenom?: string;

  cgpNom?: string;

  cgpPhone?: string;

  cgpEmail?: string;

  siteWeb?: string;

  /** Ligne d'adresse postale (cabinet) */
  postalAddress?: string;

  bodyFont?: NewsletterTypographySettings["bodyFont"];

  titleFont?: NewsletterTypographySettings["titleFont"];

  bodyFontSize?: NewsletterTypographySettings["bodyFontSize"];

  lineHeight?: NewsletterTypographySettings["lineHeight"];

  sectionSpacing?: NewsletterTypographySettings["sectionSpacing"];

}



const BODY_COLOR = "#2d3748";

const MUTED_COLOR = "#8a8a8a";

const HIGHLIGHT_BG = "#faf6f0";

function buildCtaButtonAnchor(
  label: string,
  href: string,
  accent: string,
  typo: ResolvedNewsletterTypography
): string {
  return `<a class="nl-cta-btn" href="${escapeHtml(href)}" style="display:inline-block;background:${accent};color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:4px;font-family:${typo.bodyFontFamily};font-size:15px;font-weight:600;letter-spacing:0.01em;box-shadow:0 2px 12px rgba(15,39,68,0.18);">${escapeHtml(label)}</a>`;
}

function shouldShowCta(content: GeneratedNewsletterContent): boolean {
  return content.includeCta !== false && Boolean(content.cta?.trim());
}

function resolveConseillerFields(
  content: GeneratedNewsletterContent,
  options: NewsletterHtmlOptions
): { name: string; phone: string } {
  const name =
    content.conseillerName?.trim() ||
    [options.cgpPrenom?.trim(), options.cgpNom?.trim()].filter(Boolean).join(" ");
  const phone = content.conseillerPhone?.trim() || options.cgpPhone?.trim() || "";
  return { name, phone };
}

function shouldShowConseiller(
  content: GeneratedNewsletterContent,
  options: NewsletterHtmlOptions
): boolean {
  if (content.includeConseiller === false) return false;
  const { name, phone } = resolveConseillerFields(content, options);
  return Boolean(name || phone);
}

export function defaultConseillerFields(cgp: CgpConfig | null): {
  conseillerName: string;
  conseillerPhone: string;
  includeConseiller: boolean;
} {
  const conseillerName = [cgp?.prenom?.trim(), cgp?.nom?.trim()].filter(Boolean).join(" ");
  const conseillerPhone = cgp?.telephone?.trim() ?? "";
  return {
    conseillerName,
    conseillerPhone,
    includeConseiller: Boolean(conseillerName || conseillerPhone),
  };
}

function buildMobileStyleBlock(typo: ResolvedNewsletterTypography): string {
  return `<style type="text/css">
${NEWSLETTER_RICH_TEXT_CSS}
body { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
@media only screen and (max-width: 520px) {
  .nl-outer-pad { padding: 8px 4px !important; }
  .nl-container { width: 100% !important; max-width: 100% !important; }
  .nl-header-pad { padding: 18px 16px 14px 16px !important; }
  .nl-logo-cell { padding-right: 14px !important; width: auto !important; vertical-align: middle !important; }
  .nl-header-text-cell { vertical-align: middle !important; width: auto !important; }
  .nl-logo-img { max-width: 72px !important; width: 72px !important; height: auto !important; }
  .nl-body-pad { padding: 20px 16px 8px 16px !important; font-size: ${typo.mobileBodyFontSize} !important; line-height: 1.65 !important; }
  .nl-section-pad { padding: 0 16px 16px 16px !important; }
  .nl-section-body { font-size: ${typo.mobileBodyFontSize} !important; line-height: 1.65 !important; }
  .nl-section-title { font-size: 11px !important; letter-spacing: 0.08em !important; }
  .nl-section-inner { padding: 16px 14px !important; }
  .nl-rich-pad { padding: 0 16px 14px 16px !important; }
  .nl-rich-inner { padding: 16px 14px !important; }
  .nl-cta-pad { padding: 4px 16px 16px 16px !important; }
  .nl-cta-inner { padding: 18px 14px !important; font-size: ${typo.mobileBodyFontSize} !important; }
  .nl-agenda-pad { padding: 4px 16px 20px 16px !important; }
  .nl-conseiller-pad { padding: 0 16px 20px 16px !important; }
  .nl-footer-pad { padding: 18px 16px 20px 16px !important; font-size: 12px !important; }
  .nl-section-num { display: none !important; width: 0 !important; padding: 0 !important; }
  .nl-edition-title { font-size: 17px !important; line-height: 1.35 !important; }
  .nl-cta-btn { display: block !important; width: 100% !important; max-width: none !important; margin: 0 auto !important; padding: 18px 16px !important; font-size: 14px !important; line-height: 1.3 !important; box-sizing: border-box !important; min-height: 48px !important; }
  .nl-mailto-link { display: inline-block !important; padding: 10px 4px !important; font-size: 14px !important; }
  .nl-rich-stat-value { font-size: 32px !important; }
  .nl-mobile-img { max-height: 240px !important; width: 100% !important; object-fit: cover !important; }
}
</style>`;
}

function buildImageRow(image: NewsletterPlacedImage, fullBleed = false): string {
  const src = image.dataUrl?.trim();
  if (!src) return "";
  const alt = image.alt?.trim() ? escapeHtml(image.alt.trim()) : "";
  const width = fullBleed ? 600 : 520;
  const pad = fullBleed ? "0" : "0 40px 16px 40px";
  return `<tr><td class="${fullBleed ? "" : "nl-section-pad"}" style="padding:${pad};line-height:0;font-size:0;">
<img class="nl-mobile-img" src="${escapeHtml(src)}" alt="${alt}" width="${width}" style="display:block;width:100%;max-width:${width}px;height:auto;border-radius:2px;border:0;" />
</td></tr>`;
}

function imagesHtmlAt(
  images: NewsletterPlacedImage[],
  placement: NewsletterImagePlacement,
  fullBleed = false
): string {
  return imagesMatching(images, (p) => placementMatches(p, placement))
    .map((img) => buildImageRow(img, fullBleed))
    .join("");
}

export function formatNewsletterEditionLabel(date = new Date()): string {

  return date.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

}



function buildUnsubscribeMailto(email: string): string {

  const trimmed = email.trim();

  const subject = encodeURIComponent("Désinscription newsletter");

  const body = encodeURIComponent(

    "Bonjour,\n\nMerci de me retirer de votre liste newsletter.\n\nCordialement"

  );

  return `mailto:${encodeURIComponent(trimmed)}?subject=${subject}&body=${body}`;

}



function normalizeExternalUrl(url: string): string {
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function buildFooterContactLine(
  options: NewsletterHtmlOptions,
  content: GeneratedNewsletterContent
): string {
  const parts: string[] = [];
  const phone = options.cgpPhone?.trim();
  if (shouldShowFooterPhone(content, phone)) {
    const telHref = phone!.replace(/\s/g, "");
    parts.push(
      `<a class="nl-mailto-link" href="tel:${escapeHtml(telHref)}" style="color:${MUTED_COLOR};text-decoration:none;">${escapeHtml(phone!)}</a>`
    );
  }
  const site = options.siteWeb?.trim();
  if (shouldShowFooterSite(content, site)) {
    const href = normalizeExternalUrl(site!);
    parts.push(
      `<a class="nl-mailto-link" href="${escapeHtml(href)}" style="color:${MUTED_COLOR};text-decoration:underline;">Site web</a>`
    );
  }
  if (parts.length === 0) return "";
  return `<p style="margin:0 0 10px 0;">${parts.join(" · ")}</p>`;
}

function buildNewsletterFooterHtml(
  options: NewsletterHtmlOptions,
  cabinet: string,
  content: GeneratedNewsletterContent
): string {
  const clientLine =
    cabinet && cabinet !== "Newsletter patrimoine"
      ? `Vous recevez cette newsletter en tant que contact de ${cabinet}.`
      : "Vous recevez cette newsletter en tant que contact.";

  const contactLine = buildFooterContactLine(options, content);
  const postal = options.postalAddress?.trim();
  const postalLine =
    shouldShowFooterAddress(content, postal) && postal
      ? `<p style="margin:0 0 10px 0;">${escapeHtml(postal)}</p>`
      : "";

  const email = options.unsubscribeEmail?.trim();
  const unsubscribeLine = email
    ? `<p style="margin:0;"><a class="nl-mailto-link" href="${escapeHtml(buildUnsubscribeMailto(email))}" style="color:${MUTED_COLOR};text-decoration:underline;">Se désinscrire</a></p>`
    : "";

  return `${contactLine}${postalLine}<p style="margin:0 0 10px 0;">${clientLine}</p>${unsubscribeLine}`;
}



function escapeHtml(text: string): string {

  return text

    .replace(/&/g, "&amp;")

    .replace(/</g, "&lt;")

    .replace(/>/g, "&gt;")

    .replace(/"/g, "&quot;");

}



function formatSectionNumber(index: number): string {

  return String(index + 1).padStart(2, "0");

}



function buildPreheaderBlock(preheader: string): string {

  const text = escapeHtml(preheader);

  const spacer = "&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;".repeat(

    8

  );

  return `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#f7f6f4;">${text}${spacer}</div>`;

}



function buildHeaderBlock(
  options: NewsletterHtmlOptions,
  accent: string,
  secondary: string,
  cabinet: string,
  editionTitle: string | null | undefined,
  layout: NewsletterLayout,
  typo: ResolvedNewsletterTypography
): string {
  const editionLabel = escapeHtml(
    options.editionLabel?.trim() || formatNewsletterEditionLabel()
  );
  const titleSize = layout === "single" ? "18px" : "20px";
  const titleLine = editionTitle?.trim()
    ? `<p class="nl-edition-title" style="margin:8px 0 0 0;font-family:${typo.titleFontFamily};font-size:${titleSize};line-height:1.35;color:#ffffff;font-weight:400;">${escapeHtml(editionTitle.trim())}</p>`
    : "";
  const logo = options.logoDataUrl?.trim();
  const logoSize = 120;

  const logoCell =
    logo ?
      `<td class="nl-logo-cell" style="padding-right:24px;vertical-align:middle;width:${logoSize + 8}px;">
        <img class="nl-logo-img" src="${logo}" alt="${cabinet}" width="${logoSize}" height="${logoSize}" style="display:block;max-width:${logoSize}px;width:${logoSize}px;height:auto;border-radius:4px;border:0;" />
      </td>`
    : "";

  const headerMetaFont = typo.titleFontFamily;
  const cabinetLine =
    logo ? "" : (
      `<p style="margin:0;font-family:${headerMetaFont};font-size:11px;color:rgba(255,255,255,0.82);text-transform:uppercase;letter-spacing:0.14em;font-weight:600;">${cabinet}</p>`
    );

  return `<tr><td style="background:${accent};padding:0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td style="height:3px;background:${secondary};font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td class="nl-header-pad" style="padding:28px 40px 26px 40px;">
<table role="presentation" cellpadding="0" cellspacing="0" class="nl-header-stack">
<tr>
${logoCell}
<td class="nl-header-text-cell" style="vertical-align:middle;">
${cabinetLine}
<p style="margin:${logo ? "0" : "8px 0 0 0"};font-family:${headerMetaFont};font-size:10px;color:rgba(255,255,255,0.72);text-transform:uppercase;letter-spacing:0.18em;font-weight:600;">Lettre patrimoniale</p>
${titleLine}
<p style="margin:6px 0 0 0;font-family:${headerMetaFont};font-size:11px;color:rgba(255,255,255,0.88);letter-spacing:0.04em;font-weight:400;text-transform:capitalize;">${editionLabel}</p>
</td>
</tr>
</table>
</td></tr>
</table>
</td></tr>`;
}

function buildSectionRow(
  section: { title: string; body: string; highlight?: boolean; imageUrl?: string },
  index: number,
  accent: string,
  secondary: string,
  layout: NewsletterLayout,
  typo: ResolvedNewsletterTypography
): string {
  const title = formatNewsletterSectionTitleHtml(section.title);
  const body = formatNewsletterBodyHtml(section.body);
  if (!title && !body && !section.imageUrl?.trim()) return "";

  const num = formatSectionNumber(index);
  const highlight = Boolean(section.highlight);
  const alertLayout = layout === "alert";
  const minimalLayout = layout === "minimal" || layout === "single";
  const innerPadding = highlight || alertLayout ? "24px 28px" : "0";
  const innerBg = highlight || alertLayout ? HIGHLIGHT_BG : "transparent";
  const borderColor = alertLayout && highlight ? accent : secondary;
  const innerBorder =
    highlight || alertLayout
      ? `border:1px solid ${borderColor};border-left:4px solid ${borderColor};`
      : "";

  const titleBlock = title
    ? minimalLayout
      ? `<div class="nl-section-title nl-rich-text" style="margin:0 0 10px 0;font-family:${typo.titleFontFamily};font-size:12px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${accent};">${title}</div>`
      : `<div class="nl-section-title nl-rich-text" style="margin:0 0 10px 0;font-family:${typo.titleFontFamily};font-size:11px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:${accent};">${title}</div>
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 14px 0;"><tr><td style="width:48px;height:2px;background:${secondary};font-size:0;line-height:0;">&nbsp;</td></tr></table>`
    : "";

  const bodyBlock = body
    ? `<div class="nl-rich-text nl-section-body-text" style="${newsletterBodyTextStyle(typo)}">${body}</div>`
    : "";
  const imageBlock = section.imageUrl?.trim()
    ? `<p style="margin:0 0 14px 0;"><img class="nl-mobile-img" src="${escapeHtml(section.imageUrl.trim())}" alt="" width="520" style="display:block;width:100%;max-width:520px;height:auto;border-radius:2px;border:0;" /></p>`
    : "";

  const numCell = minimalLayout
    ? ""
    : `<td class="nl-section-num" style="vertical-align:top;padding-right:18px;width:36px;font-family:Arial,Helvetica,sans-serif;font-size:26px;font-weight:300;line-height:1;color:${secondary};">${num}</td>`;

  const sectionPad =
    layout === "single"
      ? typo.sectionPad.replace(/40px/g, "32px")
      : typo.sectionPad;

  return `<tr><td class="nl-section-pad" style="padding:${sectionPad};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${innerBg};${innerBorder}">
<tr><td class="nl-section-inner" style="padding:${innerPadding};">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%">
<tr>
${numCell}
<td class="nl-section-body" style="vertical-align:top;font-family:${typo.bodyFontFamily};font-size:${typo.bodyFontSize};line-height:${typo.lineHeight};color:${BODY_COLOR};">
${imageBlock}${titleBlock}${bodyBlock}
</td>
</tr>
</table>
</td></tr>
</table>
</td></tr>`;
}

function buildCtaButtonBlock(
  label: string,
  href: string,
  accent: string,
  typo: ResolvedNewsletterTypography,
  introAboveButton?: string
): string {
  const intro = introAboveButton?.trim()
    ? `<div class="nl-rich-text" style="margin:0 0 16px 0;${newsletterBodyTextStyle(typo)}">${formatNewsletterBodyHtml(introAboveButton)}</div>`
    : "";
  return `<tr><td class="nl-cta-pad" style="padding:8px 40px 28px 40px;text-align:center;">
${intro}${buildCtaButtonAnchor(label, href, accent, typo)}
</td></tr>`;
}

function buildCtaBlock(
  cta: string,
  accent: string,
  secondary: string,
  layout: NewsletterLayout,
  typo: ResolvedNewsletterTypography
): string {
  const text = formatNewsletterBodyHtml(cta);
  if (!text.trim()) return "";

  if (layout === "alert") {
    return `<tr><td class="nl-cta-pad" style="padding:12px 40px 32px 40px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${accent};border-radius:2px;">
<tr><td class="nl-cta-inner" style="padding:24px 28px;font-family:${typo.bodyFontFamily};font-size:18px;line-height:${typo.lineHeight};color:#ffffff;text-align:center;">
<div class="nl-rich-text" style="margin:0;color:#ffffff;">${text}</div>
</td></tr>
</table>
</td></tr>`;
  }

  const border = layout === "minimal" ? accent : secondary;
  return `<tr><td class="nl-cta-pad" style="padding:8px 40px 28px 40px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf9f7;border-left:3px solid ${border};">
<tr><td class="nl-cta-inner" style="padding:22px 24px;font-family:${typo.bodyFontFamily};font-size:${typo.bodyFontSize};line-height:${typo.lineHeight};color:${BODY_COLOR};">
<div class="nl-rich-text" style="margin:0;${newsletterBodyTextStyle(typo)}">${text}</div>
</td></tr>
</table>
</td></tr>`;
}



function buildConseillerBlock(
  content: GeneratedNewsletterContent,
  options: NewsletterHtmlOptions,
  accent: string,
  typo: ResolvedNewsletterTypography
): string {
  if (!shouldShowConseiller(content, options)) return "";

  const { name, phone } = resolveConseillerFields(content, options);

  if (!name && !phone) return "";

  const phoneLine =

    phone ?

      `<p style="margin:6px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;"><a class="nl-mailto-link" href="tel:${escapeHtml(phone.replace(/\s/g, ""))}" style="color:${accent};text-decoration:none;">${escapeHtml(phone)}</a></p>`

    : "";



  return `<tr><td class="nl-conseiller-pad" style="padding:0 40px 32px 40px;">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf9f7;border-top:1px solid #ebe8e3;">

<tr><td style="padding:22px 24px;">

<p style="margin:0 0 6px 0;font-family:${typo.titleFontFamily};font-size:10px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:${MUTED_COLOR};">Votre conseiller</p>

${name ? `<p style="margin:0;font-family:${typo.bodyFontFamily};font-size:18px;line-height:1.4;color:${BODY_COLOR};">${escapeHtml(name)}</p>` : ""}

${phoneLine}

</td></tr>

</table>

</td></tr>`;

}



function buildAgendaBlock(
  options: NewsletterHtmlOptions,
  accent: string,
  typo: ResolvedNewsletterTypography
): string {
  const agendaUrl = options.agendaUrl?.trim();
  if (!agendaUrl) return "";

  const agendaBtn = buildCtaButtonAnchor("Prendre rendez-vous", agendaUrl, accent, typo);

  return `<tr><td class="nl-agenda-pad" style="padding:8px 40px 36px 40px;text-align:center;">
${agendaBtn}
</td></tr>`;
}



function resolvePreheader(

  content: GeneratedNewsletterContent,

  options: NewsletterHtmlOptions

): string {

  const explicit =

    options.preheader?.trim() || content.preheader?.trim() || "";

  if (explicit) return explicit.slice(0, 140);

  const fromIntro = content.intro.replace(/\{\{prenom\}\}/gi, "").trim();

  return fromIntro.slice(0, 120);

}

/** Preheader inbox pour l'aperçu UI (hors options HTML). */

export function resolveNewsletterPreheader(content: GeneratedNewsletterContent): string {

  return resolvePreheader(content, {});

}



/** Insère la signature HTML du CGP avant le pied de page newsletter. */

export function injectNewsletterSignatureHtml(

  html: string,

  signatureHtml: string | null | undefined

): string {

  const sig = signatureHtml?.trim();

  if (!sig || html.includes(sig)) {

    return html.replace(NEWSLETTER_SIGNATURE_MARKER, "");

  }

  const sigRow = `<tr><td style="padding:28px 40px 0 40px;border-top:1px solid #ebe8e3;">${sig}</td></tr>`;

  return html.replace(NEWSLETTER_SIGNATURE_MARKER, sigRow);

}



/** Corps texte brut pour template email (édition + aperçu Suivi). */

export function buildNewsletterPlainBody(content: GeneratedNewsletterContent): string {

  const lines: string[] = [];

  if (content.intro.trim()) lines.push(newsletterFieldToPlain(content.intro));

  for (const section of content.sections) {

    const plainTitle = newsletterFieldToPlain(section.title).trim();
    if (plainTitle) lines.push("", plainTitle);

    if (section.body.trim()) lines.push(newsletterFieldToPlain(section.body));

  }

  if (shouldShowCta(content)) {
    lines.push("", newsletterFieldToPlain(content.cta));
  }

  return lines.join("\n").trim();

}



/** HTML newsletter (mise en page fixe, contenu injecté). */

export function buildNewsletterHtml(

  content: GeneratedNewsletterContent,

  options: NewsletterHtmlOptions = {}

): string {

  const branding = resolveNewsletterBranding({
    accentColor: options.accentColor,
    secondaryColor: options.secondaryColor,
    layout: content.layout ?? options.layout,
  });
  const { accentColor: accent, secondaryColor: secondary, layout } = branding;
  const typo = resolveNewsletterTypography({
    bodyFont: options.bodyFont,
    titleFont: options.titleFont,
    bodyFontSize: options.bodyFontSize,
    lineHeight: options.lineHeight,
    sectionSpacing: options.sectionSpacing,
  });
  const images = normalizeNewsletterImages(content);
  const blocks = normalizeNewsletterBlocks(content);

  const cabinet = escapeHtml(options.cabinetName?.trim() || "Newsletter patrimoine");

  const intro = formatNewsletterBodyHtml(content.intro);

  const preheader = resolvePreheader(content, options);

  let sectionsHtml = "";
  for (let i = 0; i < content.sections.length; i++) {
    sectionsHtml += blocksHtmlAt(blocks, { type: "before_section", index: i }, accent, secondary, typo);
    sectionsHtml += imagesHtmlAt(images, { type: "before_section", index: i });
    sectionsHtml += buildSectionRow(
      content.sections[i]!,
      i,
      accent,
      secondary,
      layout,
      typo
    );
    sectionsHtml += imagesHtmlAt(images, { type: "after_section", index: i });
    sectionsHtml += blocksHtmlAt(blocks, { type: "after_section", index: i }, accent, secondary, typo);
  }

  const resolvedCta = resolveNewsletterCta(content, { agendaUrl: options.agendaUrl });
  let ctaHtml = "";
  if (resolvedCta.mode === "text" && resolvedCta.text) {
    ctaHtml = buildCtaBlock(resolvedCta.text, accent, secondary, layout, typo);
  } else if (
    resolvedCta.mode === "button" &&
    resolvedCta.buttonHref &&
    resolvedCta.buttonLabel
  ) {
    ctaHtml = buildCtaButtonBlock(
      resolvedCta.buttonLabel,
      resolvedCta.buttonHref,
      accent,
      typo,
      resolvedCta.introAboveButton
    );
  }
  const showAgendaBlock = shouldShowNewsletterAgendaBlock(content, options, resolvedCta);

  const preheaderBlock = preheader ? buildPreheaderBlock(preheader) : "";

  const introPad =
    layout === "single"
      ? typo.introPad.replace(/40px/g, "32px")
      : typo.introPad;



  return `<!DOCTYPE html>

<html lang="fr">

<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">${buildMobileStyleBlock(typo)}</head>

<body style="margin:0;padding:0;background:#f7f6f4;">

${preheaderBlock}

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="nl-outer-pad" style="background:#f7f6f4;padding:32px 16px;">

<tr><td align="center">

<table role="presentation" width="600" cellpadding="0" cellspacing="0" class="nl-container" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #e5e2dd;border-radius:2px;overflow:hidden;box-shadow:0 4px 24px rgba(15,39,68,0.08);">

${buildHeaderBlock(options, accent, secondary, cabinet, content.editionTitle, layout, typo)}

${imagesHtmlAt(images, { type: "header" }, true)}
${blocksHtmlAt(blocks, { type: "header" }, accent, secondary, typo)}

<tr><td class="nl-body-pad" style="padding:${introPad};font-family:${typo.bodyFontFamily};font-size:${typo.bodyFontSize};line-height:${typo.lineHeight};color:${BODY_COLOR};">

<div class="nl-rich-text" style="${newsletterBodyTextStyle(typo)}">${intro}</div>

</td></tr>

${imagesHtmlAt(images, { type: "after_intro" })}
${blocksHtmlAt(blocks, { type: "after_intro" }, accent, secondary, typo)}

${sectionsHtml}

${imagesHtmlAt(images, { type: "before_cta" })}
${blocksHtmlAt(blocks, { type: "before_cta" }, accent, secondary, typo)}

${ctaHtml}

${showAgendaBlock ? buildAgendaBlock(options, accent, typo) : ""}

${buildConseillerBlock(content, options, accent, typo)}

${NEWSLETTER_SIGNATURE_MARKER}

<tr><td class="nl-footer-pad" style="padding:24px 40px 28px 40px;font-size:11px;color:${MUTED_COLOR};font-family:Arial,Helvetica,sans-serif;line-height:1.6;background:#fafafa;border-top:1px solid #ebe8e3;">

${buildNewsletterFooterHtml(options, cabinet, content)}

</td></tr>

</table>

</td></tr>

</table>

</body>

</html>`;

}



export function serializeNewsletterTemplateMeta(html: string): string {

  return JSON.stringify({ [NEWSLETTER_TEMPLATE_META_KEY]: html } satisfies NewsletterTemplateMeta);

}



export function parseNewsletterTemplateMeta(

  variables: string | null | undefined

): NewsletterTemplateMeta | null {

  if (!variables?.trim()) return null;

  try {

    const parsed = JSON.parse(variables) as Partial<NewsletterTemplateMeta>;

    if (typeof parsed.newsletter_html === "string" && parsed.newsletter_html.trim()) {

      return { newsletter_html: parsed.newsletter_html };

    }

  } catch {

    /* ignore */

  }

  return null;

}



export function isNewsletterTemplate(categorie: string | null | undefined): boolean {

  return categorie === "NEWSLETTER";

}



export function applyVariablesToNewsletterHtml(

  html: string,

  vars: Record<string, string>

): string {

  return replaceTemplateVariables(html, vars);

}



export { formatCgpPostalAddress } from "@/lib/newsletter/newsletter-footer-options";

export function buildNewsletterHtmlOptions(
  cgp: CgpConfig | null,
  branding?: {
    accentColor?: string | null;
    secondaryColor?: string | null;
    layout?: NewsletterLayout | null;
    typography?: NewsletterTypographySettings | null;
    agendaLinkId?: string | null;
  }
): NewsletterHtmlOptions {
  const agendaUrl = resolveAgendaUrl(cgp, branding?.agendaLinkId)?.trim() || undefined;

  const resolved = resolveNewsletterBranding({
    accentColor: branding?.accentColor,
    secondaryColor: branding?.secondaryColor,
    layout: branding?.layout,
  });
  return {
    cabinetName: cgp?.cabinet?.trim() || undefined,
    accentColor: resolved.accentColor,
    secondaryColor: resolved.secondaryColor,
    layout: resolved.layout,
    bodyFont: branding?.typography?.bodyFont ?? undefined,
    titleFont: branding?.typography?.titleFont ?? undefined,
    bodyFontSize: branding?.typography?.bodyFontSize ?? undefined,
    lineHeight: branding?.typography?.lineHeight ?? undefined,
    sectionSpacing: branding?.typography?.sectionSpacing ?? undefined,
    agendaUrl,
    unsubscribeEmail: cgp?.email?.trim() || undefined,
    cgpPrenom: cgp?.prenom?.trim() || undefined,
    cgpNom: cgp?.nom?.trim() || undefined,
    cgpPhone: cgp?.telephone?.trim() || undefined,
    cgpEmail: cgp?.email?.trim() || undefined,
    siteWeb: cgp?.site_web?.trim() || undefined,
    postalAddress: formatCgpPostalAddress(cgp),
  };
}



export function contentFromPlainEdit(

  subject: string,

  plainBody: string

): GeneratedNewsletterContent {

  const parts = plainBody.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);

  const intro = parts[0] ?? "";

  const cta = parts.length > 1 ? (parts[parts.length - 1] ?? "") : "";

  const middle = parts.slice(1, parts.length > 1 ? -1 : undefined);

  const sections = middle.map((block, i) => {

    const lines = block.split("\n");

    const first = lines[0]?.trim() ?? "";

    const rest = lines.slice(1).join("\n").trim();

    if (rest) {

      return { title: first, body: rest };

    }

    return { title: `Point ${i + 1}`, body: first };

  });

  return {
    subject,
    intro,
    sections,
    cta,
    includeCta: Boolean(cta.trim()),
  };

}



/** Brouillon édité (texte brut) + métadonnées / mise en avant Mistral conservées. */

export function mergeNewsletterDraftFromPlain(

  subject: string,

  plainBody: string,

  previous?: GeneratedNewsletterContent | null

): GeneratedNewsletterContent {

  const parsed = contentFromPlainEdit(subject, plainBody);

  const sections = parsed.sections.map((section, index) => ({

    ...section,

    ...(previous?.sections?.[index]?.highlight === true ? { highlight: true } : {}),

    ...(previous?.sections?.[index]?.imageUrl?.trim()
      ? { imageUrl: previous.sections[index].imageUrl?.trim() }
      : {}),

  }));

  return {

    ...parsed,

    sections,

    ...(previous?.preheader?.trim() ? { preheader: previous.preheader.trim() } : {}),

    ...(previous?.editionTitle?.trim() ? { editionTitle: previous.editionTitle.trim() } : {}),

    ...(previous?.headerImageUrl?.trim() ? { headerImageUrl: previous.headerImageUrl.trim() } : {}),
    ...(previous?.images?.length ? { images: previous.images } : {}),
    ...(previous?.blocks?.length ? { blocks: previous.blocks } : {}),
    ...(previous?.layout ? { layout: previous.layout } : {}),
    ...(previous?.includeCta != null ? { includeCta: previous.includeCta } : {}),
    ...(previous?.includeConseiller != null
      ? { includeConseiller: previous.includeConseiller }
      : {}),
    ...(previous?.conseillerName != null ? { conseillerName: previous.conseillerName } : {}),
    ...(previous?.conseillerPhone != null ? { conseillerPhone: previous.conseillerPhone } : {}),
    ...(previous?.ctaLabel?.trim() ? { ctaLabel: previous.ctaLabel.trim() } : {}),
    ...(previous?.ctaUrl?.trim() ? { ctaUrl: previous.ctaUrl.trim() } : {}),
    ...(previous?.includeFooterPhone === true ? { includeFooterPhone: true } : {}),
    ...(previous?.includeFooterSite === true ? { includeFooterSite: true } : {}),
    ...(previous?.includeFooterAddress === true ? { includeFooterAddress: true } : {}),
  };
}

/** Brouillon structuré (mode sections) avec sujet éditable. */

export function draftFromStructuredContent(

  subject: string,

  content: GeneratedNewsletterContent

): GeneratedNewsletterContent {

  return { ...content, subject: subject.trim() || content.subject };

}

