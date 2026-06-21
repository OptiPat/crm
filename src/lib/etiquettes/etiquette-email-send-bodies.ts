import type { CgpConfig } from "@/lib/api/tauri-settings";
import { appendEmailSignature } from "@/lib/emails/email-signature";
import {
  stripOrphanStelliumFormalityHtml,
  stripOrphanStelliumFormalityLines,
} from "@/lib/emails/stellium-perf-preview-vars";
import {
  buildTemplateSendBodies,
  htmlToPlainEmail,
  normalizeTemplateEmailHtmlLikeGmail,
  sanitizeTemplateEmailHtml,
} from "@/lib/emails/template-email-html";

/** Corps final à partir du HTML édité dans « Confirmer et envoyer » (conserve la mise en forme). */
export function buildEditedHtmlEmailSendBodies(
  bodyHtml: string,
  cgp: CgpConfig | null
): { body: string; body_html: string } {
  const sanitized = sanitizeTemplateEmailHtml(bodyHtml.trim());
  const normalized = stripOrphanStelliumFormalityHtml(
    normalizeTemplateEmailHtmlLikeGmail(sanitized)
  );
  const plainCore = stripOrphanStelliumFormalityLines(htmlToPlainEmail(normalized));
  const { body, body_html } = buildTemplateSendBodies(
    appendEmailSignature(plainCore, cgp?.email_signature),
    normalized,
    cgp,
    { htmlAlreadyNormalized: true }
  );
  return { body, body_html: body_html ?? normalized };
}
