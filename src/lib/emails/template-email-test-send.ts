import { getEmailConnectionStatus } from "@/lib/api/tauri-email-oauth";
import { sendEmail } from "@/lib/api/tauri-email";
import type { CgpConfig } from "@/lib/api/tauri-settings";
import { setTemplateCorpsHtmlInMeta } from "@/lib/emails/template-email-html";
import {
  renderTemplatePreview,
  SAMPLE_PREVIEW_CONTACT,
} from "@/lib/emails/template-email-meta";

export type TemplateTestSendContact = {
  prenom: string;
  nom: string;
  email: string;
  telephone: string;
};

export async function sendTemplateTestToSelf(params: {
  sujet: string;
  corps: string;
  corpsHtml?: string | null;
  templateVariables?: string | null;
  agendaLinkId?: string | null;
  cgp: CgpConfig | null;
  contact?: TemplateTestSendContact | null;
}): Promise<string> {
  const status = await getEmailConnectionStatus();
  if (!status.connected || !status.email?.trim()) {
    throw new Error(
      "Connectez Gmail ou Microsoft dans Paramètres → Email pour envoyer un test."
    );
  }

  const contact = params.contact ?? SAMPLE_PREVIEW_CONTACT;
  const variables = setTemplateCorpsHtmlInMeta(
    params.templateVariables ?? null,
    params.corpsHtml?.trim() || null
  );
  const preview = renderTemplatePreview(
    params.sujet,
    params.corps,
    contact,
    params.cgp,
    params.agendaLinkId,
    variables,
    params.corpsHtml
  );

  const subject = preview.subject.trim()
    ? `[Test CRM] ${preview.subject}`
    : "[Test CRM] Modèle email";

  await sendEmail({
    to_email: status.email.trim(),
    subject,
    body: preview.body,
    body_html: preview.body_html,
  });

  return status.email.trim();
}
