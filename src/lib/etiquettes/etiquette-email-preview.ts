import { replaceTemplateVariables } from "@/lib/api/tauri-templates-email";
import { appendEmailSignature } from "@/lib/emails/email-signature";
import {
  buildTemplateSendBodies,
  getTemplateCorpsHtml,
  prepareTemplateHtmlForSend,
} from "@/lib/emails/template-email-html";
import { buildVariablesFromContact } from "@/lib/emails/template-email-meta";
import {
  applyVariablesToNewsletterHtml,
  injectNewsletterSignatureHtml,
  isNewsletterTemplate,
  parseNewsletterTemplateMeta,
} from "@/lib/newsletter/newsletter-html";
import { parseMillesimeLabelFromEtiquetteNom } from "@/lib/etiquettes/exceltis";
import type { CgpConfig } from "@/lib/api/tauri-settings";
import type { EtiquetteEmailQueueItem } from "@/lib/api/tauri-etiquettes";
import {
  isScpiBulletinQueueItem,
  parseScpiCampaignVariables,
  templateUsesScpiBulletinVariables,
} from "@/lib/emails/scpi-bulletin-preview-vars";
import { isScpiDigestStale } from "@/lib/emails/scpi-digest-stale";

function parseCampaignVariables(raw: string | null | undefined): Record<string, string> {
  return parseScpiCampaignVariables(raw);
}

export function buildTemplateVariables(
  item: EtiquetteEmailQueueItem,
  cgp: CgpConfig | null
): Record<string, string> {
  const millesime = parseMillesimeLabelFromEtiquetteNom(item.etiquette_nom) ?? "";
  return {
    ...buildVariablesFromContact(
      {
        prenom: item.contact_prenom,
        nom: item.contact_nom,
        email: item.contact_email,
        telephone: item.contact_telephone,
      },
      cgp,
      item.template_agenda_link_id
    ),
    millesime,
    etiquette_nom: item.etiquette_nom,
    ...parseCampaignVariables(item.campaign_variables),
  };
}

export function renderEtiquetteEmailPreview(
  item: EtiquetteEmailQueueItem,
  cgp: CgpConfig | null
): { subject: string; body: string; body_html: string | null } {
  const vars = buildTemplateVariables(item, cgp);
  const subject = replaceTemplateVariables(item.template_sujet, vars);
  const bodyCore = replaceTemplateVariables(item.template_corps, vars);
  const body = appendEmailSignature(bodyCore, cgp?.email_signature);

  if (isNewsletterTemplate(item.template_categorie)) {
    const meta = parseNewsletterTemplateMeta(item.template_variables);
    if (meta?.newsletter_html) {
      let html = applyVariablesToNewsletterHtml(meta.newsletter_html, vars);
      html = injectNewsletterSignatureHtml(html, cgp?.email_signature_html);
      return { subject, body, body_html: html };
    }
  }

  const corpsHtmlStored = getTemplateCorpsHtml(item.template_variables);
  const bodyHtmlCore = corpsHtmlStored
    ? prepareTemplateHtmlForSend(corpsHtmlStored, vars)
    : null;
  const { body_html } = buildTemplateSendBodies(body, bodyHtmlCore, cgp, {
    htmlAlreadyNormalized: Boolean(bodyHtmlCore),
  });
  return { subject, body, body_html };
}

/** Indice : dernier contact fiche mis à jour après l'envoi campagne. */
export function hasContactActivityAfterEmailSend(
  item: EtiquetteEmailQueueItem
): boolean {
  const sent = item.email_date_envoi;
  const last = item.contact_date_dernier_contact;
  if (sent == null || last == null) return false;
  return last > sent;
}

/** datetime-local (YYYY-MM-DDTHH:mm) → unix secondes */
export function localDatetimeToUnix(isoLocal: string): number | null {
  if (!isoLocal.trim()) return null;
  const ms = new Date(isoLocal).getTime();
  if (Number.isNaN(ms)) return null;
  return Math.floor(ms / 1000);
}

export function unixToLocalDatetime(ts: number | null | undefined): string {
  if (ts == null || ts <= 0) return "";
  const d = new Date(ts * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const INCOMPLETE_LABELS: Record<string, string> = {
  NO_EMAIL: "Email manquant sur la fiche contact",
  NO_TEMPLATE: "Template d'email manquant sur l'étiquette",
  NO_DATE: "Date d'envoi non définie sur l'étiquette",
  SCHEDULED: "Envoi prévu plus tard (date pas encore atteinte)",
  OTHER: "Informations à compléter",
};

export function getIncompleteQueueLabel(issue: string | null | undefined): string {
  if (!issue) return INCOMPLETE_LABELS.OTHER;
  return INCOMPLETE_LABELS[issue] ?? INCOMPLETE_LABELS.OTHER;
}

/** True si le mail SCPI n'a pas de résumé injecté (campagne n8n à relancer). */
export function isScpiBulletinContentMissing(item: EtiquetteEmailQueueItem): boolean {
  const hay = `${item.template_corps}\n${getTemplateCorpsHtml(item.template_variables) ?? ""}`;
  if (!templateUsesScpiBulletinVariables(hay)) return false;
  const campaign = parseCampaignVariables(item.campaign_variables);
  return !campaign.bulletin_resume?.trim();
}

/** Raison de blocage envoi SCPI (null = envoi autorisé pour ce contrôle). */
export function getScpiBulletinSendBlockReason(
  item: EtiquetteEmailQueueItem
): string | null {
  if (!isScpiBulletinQueueItem(item)) return null;
  if (isScpiBulletinContentMissing(item)) {
    return "Résumé bulletins absent — relancez n8n prepare";
  }
  if (isScpiDigestStale(item.campaign_variables)) {
    return "Digest périmé — relancez n8n prepare (ne pas renvoyer tel quel)";
  }
  return null;
}

export function isScpiBulletinSendBlocked(item: EtiquetteEmailQueueItem): boolean {
  return getScpiBulletinSendBlockReason(item) != null;
}

export function formatEtiquetteSendDatetime(ts: number | null | undefined): string {
  if (ts == null) return "—";
  return new Date(ts * 1000).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
