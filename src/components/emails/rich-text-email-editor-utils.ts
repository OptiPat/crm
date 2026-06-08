import { sanitizeTemplateEmailHtml, normalizeTemplateEmailHtmlLikeGmail } from "@/lib/emails/template-email-html";

export function normalizeEditorHtml(html: string): string {
  const trimmed = html.trim();
  if (!trimmed || trimmed === "<br>" || trimmed === "<div><br></div>") {
    return "";
  }
  return html;
}
/** Pendant la saisie : sécurise sans restructurer (évite de casser le curseur / l’aperçu live). */
export function sanitizeEditorHtml(html: string): string {
  return sanitizeTemplateEmailHtml(normalizeEditorHtml(html));
}

/** Au blur / enregistrement : format Gmail (div par ligne). */
export function finalizeEditorHtmlForStorage(html: string): string {
  const sanitized = sanitizeTemplateEmailHtml(html.trim());
  if (!sanitized) return "";
  return normalizeTemplateEmailHtmlLikeGmail(sanitized).replace(
    /^<div dir="ltr">([\s\S]*)<\/div>$/i,
    "$1"
  );
}

/** Sauvegarde la sélection courante dans l'éditeur riche. */
export function saveRichEditorSelection(editorEl: HTMLDivElement | null): Range | null {
  if (!editorEl) return null;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!editorEl.contains(range.commonAncestorContainer)) return null;
  return range.cloneRange();
}

/** Insère du texte à la position du curseur dans l'éditeur. */
export function insertTextInRichEditor(
  editorEl: HTMLDivElement | null,
  text: string,
  savedRange?: Range | null
): string {
  if (!editorEl) return "";
  editorEl.focus();
  const sel = window.getSelection();
  let range = saveRichEditorSelection(editorEl) ?? savedRange ?? null;
  if (range && !editorEl.contains(range.commonAncestorContainer)) {
    range = savedRange && editorEl.contains(savedRange.commonAncestorContainer)
      ? savedRange
      : null;
  }
  if (range) {
    sel?.removeAllRanges();
    sel?.addRange(range);
  }
  document.execCommand("insertText", false, text);
  return sanitizeEditorHtml(normalizeEditorHtml(editorEl.innerHTML));
}
