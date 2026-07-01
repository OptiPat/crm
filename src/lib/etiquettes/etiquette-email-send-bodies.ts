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
  if (!sanitized.trim()) {
    return { body: "", body_html: "" };
  }
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
  const htmlOut = body_html ?? normalized;
  const plainOut = body.trim();
  const htmlPlain = htmlToPlainEmail(htmlOut).trim();
  if (!plainOut && !htmlPlain) {
    return { body: "", body_html: "" };
  }
  return { body, body_html: htmlOut };
}
