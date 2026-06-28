import type { CgpConfig } from "@/lib/api/tauri-settings";
import { appendEmailSignature, plainTextContainsEmailSignature } from "@/lib/emails/email-signature";
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

function plainBodyAlreadyHasSignature(plain: string, cgp: CgpConfig | null): boolean {
  if (plainTextContainsEmailSignature(plain, cgp?.email_signature)) return true;
  const htmlSig = cgp?.email_signature_html?.trim();
  if (htmlSig) {
    return plainTextContainsEmailSignature(plain, htmlToPlainEmail(htmlSig));
  }
  return false;
}

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
  const plainWithSignature = plainBodyAlreadyHasSignature(plainCore, cgp)
    ? plainCore
    : appendEmailSignature(plainCore, cgp?.email_signature);
  const { body, body_html } = buildTemplateSendBodies(
    plainWithSignature,
    normalized,
    cgp,
    { htmlAlreadyNormalized: true }
  );
  return { body, body_html: body_html ?? normalized };
}
