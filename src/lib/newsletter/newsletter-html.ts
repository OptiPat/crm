import type { GeneratedNewsletterContent } from "@/lib/api/tauri-newsletter";

import type { CgpConfig } from "@/lib/api/tauri-settings";

import { replaceTemplateVariables } from "@/lib/api/tauri-templates-email";



export const NEWSLETTER_TEMPLATE_META_KEY = "newsletter_html";



/** Point d'insertion de la signature CGP (avant le pied de page). */

export const NEWSLETTER_SIGNATURE_MARKER = "<!-- newsletter-signature -->";



export interface NewsletterTemplateMeta {

  newsletter_html: string;

}



export interface NewsletterHtmlOptions {

  cabinetName?: string;

  accentColor?: string;

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

}



const PREMIUM_GOLD = "#b8956a";

const PREMIUM_NAVY = "#0f2744";

const BODY_COLOR = "#2d3748";

const MUTED_COLOR = "#8a8a8a";

const HIGHLIGHT_BG = "#faf6f0";



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



function buildNewsletterFooterHtml(options: NewsletterHtmlOptions, cabinet: string): string {

  const clientLine =

    cabinet && cabinet !== "Newsletter patrimoine" ?

      `Vous recevez cette newsletter en tant que contact de ${cabinet}.`

    : "Vous recevez cette newsletter en tant que contact.";

  const email = options.unsubscribeEmail?.trim();

  if (email) {

    const mailto = buildUnsubscribeMailto(email);

    return `<p style="margin:0 0 10px 0;">${clientLine}</p>

<p style="margin:0;"><a href="${escapeHtml(mailto)}" style="color:${MUTED_COLOR};text-decoration:underline;">Se désinscrire</a></p>`;

  }

  return `<p style="margin:0;">${clientLine}</p>`;

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



function buildHeaderBlock(options: NewsletterHtmlOptions, accent: string, cabinet: string): string {
  const editionLabel = escapeHtml(
    options.editionLabel?.trim() || formatNewsletterEditionLabel()
  );
  const logo = options.logoDataUrl?.trim();
  const logoSize = 120;

  const logoCell =
    logo ?
      `<td style="padding-right:24px;vertical-align:middle;width:${logoSize + 8}px;">
        <img src="${logo}" alt="" width="${logoSize}" height="${logoSize}" style="display:block;max-width:${logoSize}px;width:${logoSize}px;height:auto;border-radius:4px;border:0;" />
      </td>`
    : "";

  const cabinetLine =
    logo ? "" : (
      `<p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:rgba(255,255,255,0.82);text-transform:uppercase;letter-spacing:0.14em;font-weight:600;">${cabinet}</p>`
    );

  return `<tr><td style="background:${accent};padding:0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td style="height:3px;background:${PREMIUM_GOLD};font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td style="padding:28px 40px 26px 40px;">
<table role="presentation" cellpadding="0" cellspacing="0">
<tr>
${logoCell}
<td style="vertical-align:middle;">
${cabinetLine}
<p style="margin:${logo ? "0" : "8px 0 0 0"};font-family:Arial,Helvetica,sans-serif;font-size:10px;color:rgba(255,255,255,0.72);text-transform:uppercase;letter-spacing:0.18em;font-weight:600;">Lettre patrimoniale</p>
<p style="margin:6px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:rgba(255,255,255,0.88);letter-spacing:0.04em;font-weight:400;text-transform:capitalize;">${editionLabel}</p>
</td>
</tr>
</table>
</td></tr>
</table>
</td></tr>`;
}



function buildSectionRow(

  section: { title: string; body: string; highlight?: boolean },

  index: number,

  accent: string

): string {

  const title = escapeHtml(section.title);

  const body = escapeHtml(section.body).replace(/\n/g, "<br>");

  if (!title && !body) return "";



  const num = formatSectionNumber(index);

  const highlight = Boolean(section.highlight);

  const innerPadding = highlight ? "24px 28px" : "0";

  const innerBg = highlight ? HIGHLIGHT_BG : "transparent";

  const innerBorder =

    highlight ?

      `border:1px solid ${PREMIUM_GOLD};border-left:4px solid ${PREMIUM_GOLD};`

    : "";



  const titleBlock =

    title ?

      `<p style="margin:0 0 10px 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:${accent};">${title}</p>

        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 14px 0;"><tr><td style="width:48px;height:2px;background:${PREMIUM_GOLD};font-size:0;line-height:0;">&nbsp;</td></tr></table>`

    : "";



  const bodyBlock = body ? `<p style="margin:0;">${body}</p>` : "";



  return `<tr><td style="padding:0 40px 28px 40px;">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${innerBg};${innerBorder}">

<tr><td style="padding:${innerPadding};">

<table role="presentation" cellpadding="0" cellspacing="0" width="100%">

<tr>

<td style="vertical-align:top;padding-right:18px;width:36px;font-family:Arial,Helvetica,sans-serif;font-size:26px;font-weight:300;line-height:1;color:${PREMIUM_GOLD};">${num}</td>

<td style="vertical-align:top;font-family:Georgia,'Times New Roman',Times,serif;font-size:17px;line-height:1.75;color:${BODY_COLOR};">

${titleBlock}${bodyBlock}

</td>

</tr>

</table>

</td></tr>

</table>

</td></tr>`;

}



function buildConseillerBlock(options: NewsletterHtmlOptions): string {

  const prenom = options.cgpPrenom?.trim();

  const nom = options.cgpNom?.trim();

  const name = [prenom, nom].filter(Boolean).join(" ");

  if (!name) return "";



  const phone = options.cgpPhone?.trim();

  const phoneLine =

    phone ?

      `<p style="margin:6px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;"><a href="tel:${escapeHtml(phone.replace(/\s/g, ""))}" style="color:${PREMIUM_NAVY};text-decoration:none;">${escapeHtml(phone)}</a></p>`

    : "";



  return `<tr><td style="padding:0 40px 32px 40px;">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf9f7;border-top:1px solid #ebe8e3;">

<tr><td style="padding:22px 24px;">

<p style="margin:0 0 6px 0;font-family:Arial,Helvetica,sans-serif;font-size:10px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:${MUTED_COLOR};">Votre conseiller</p>

<p style="margin:0;font-family:Georgia,'Times New Roman',Times,serif;font-size:18px;line-height:1.4;color:${BODY_COLOR};">${escapeHtml(name)}</p>

${phoneLine}

</td></tr>

</table>

</td></tr>`;

}



function buildAgendaBlock(options: NewsletterHtmlOptions, accent: string): string {

  const agendaUrl = options.agendaUrl?.trim();

  const email = options.cgpEmail?.trim();

  if (!agendaUrl && !email) return "";



  const agendaBtn =

    agendaUrl ?

      `<a href="${escapeHtml(agendaUrl)}" style="display:inline-block;background:${accent};color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:2px;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;box-shadow:0 2px 12px rgba(15,39,68,0.22);">Prendre rendez-vous</a>`

    : "";



  const replyLink =

    email ?

      `<p style="margin:16px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;">

        <a href="mailto:${escapeHtml(email)}" style="color:${accent};text-decoration:underline;">Me répondre par email</a>

      </p>`

    : "";



  return `<tr><td style="padding:8px 40px 36px 40px;text-align:center;">

${agendaBtn}${replyLink}

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

  if (content.intro.trim()) lines.push(content.intro.trim());

  for (const section of content.sections) {

    if (section.title.trim()) lines.push("", section.title.trim());

    if (section.body.trim()) lines.push(section.body.trim());

  }

  if (content.cta.trim()) {

    lines.push("", content.cta.trim());

  }

  return lines.join("\n").trim();

}



/** HTML newsletter (mise en page fixe, contenu injecté). */

export function buildNewsletterHtml(

  content: GeneratedNewsletterContent,

  options: NewsletterHtmlOptions = {}

): string {

  const accent = options.accentColor?.trim() || PREMIUM_NAVY;

  const cabinet = escapeHtml(options.cabinetName?.trim() || "Newsletter patrimoine");

  const intro = escapeHtml(content.intro).replace(/\n/g, "<br>");

  const preheader = resolvePreheader(content, options);

  const sectionsHtml = content.sections

    .map((s, i) => buildSectionRow(s, i, accent))

    .join("");



  const cta = escapeHtml(content.cta).replace(/\n/g, "<br>");

  const preheaderBlock = preheader ? buildPreheaderBlock(preheader) : "";



  return `<!DOCTYPE html>

<html lang="fr">

<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>

<body style="margin:0;padding:0;background:#f7f6f4;">

${preheaderBlock}

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f6f4;padding:32px 16px;">

<tr><td align="center">

<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #e5e2dd;border-radius:2px;overflow:hidden;box-shadow:0 4px 24px rgba(15,39,68,0.08);">

${buildHeaderBlock(options, accent, cabinet)}

<tr><td style="padding:36px 40px 12px 40px;font-family:Georgia,'Times New Roman',Times,serif;font-size:17px;line-height:1.75;color:${BODY_COLOR};">

<p style="margin:0;">${intro}</p>

</td></tr>

${sectionsHtml}

<tr><td style="padding:8px 40px 28px 40px;">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf9f7;border-left:3px solid ${PREMIUM_GOLD};">

<tr><td style="padding:22px 24px;font-family:Georgia,'Times New Roman',Times,serif;font-size:17px;line-height:1.75;color:${BODY_COLOR};">

<p style="margin:0;">${cta}</p>

</td></tr>

</table>

</td></tr>

${buildAgendaBlock(options, accent)}

${buildConseillerBlock(options)}

${NEWSLETTER_SIGNATURE_MARKER}

<tr><td style="padding:24px 40px 28px 40px;font-size:11px;color:${MUTED_COLOR};font-family:Arial,Helvetica,sans-serif;line-height:1.6;background:#fafafa;border-top:1px solid #ebe8e3;">

${buildNewsletterFooterHtml(options, cabinet)}

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



export function buildNewsletterHtmlOptions(cgp: CgpConfig | null): NewsletterHtmlOptions {

  const agendaUrl =

    cgp?.agenda_links?.find((l) => l.url?.trim())?.url?.trim() ?? undefined;

  return {

    cabinetName: cgp?.cabinet?.trim() || undefined,

    accentColor: PREMIUM_NAVY,

    agendaUrl,

    unsubscribeEmail: cgp?.email?.trim() || undefined,

    cgpPrenom: cgp?.prenom?.trim() || undefined,

    cgpNom: cgp?.nom?.trim() || undefined,

    cgpPhone: cgp?.telephone?.trim() || undefined,

    cgpEmail: cgp?.email?.trim() || undefined,

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

  return { subject, intro, sections, cta };

}

