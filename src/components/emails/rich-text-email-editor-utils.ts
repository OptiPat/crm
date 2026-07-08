import {
  canonicalizeTemplateCorpsHtml,
  sanitizeTemplateEmailHtml,
  normalizeTemplateEmailHtmlLikeGmail,
} from "@/lib/emails/template-email-html";
import { sanitizeNoteHtml } from "@/lib/notes/note-html";

export type RichEditorSanitizeMode = "email" | "note";

export function normalizeEditorHtml(html: string): string {
  const trimmed = html.trim();
  if (!trimmed || trimmed === "<br>" || trimmed === "<div><br></div>") {
    return "";
  }
  return html;
}
/** Pendant la saisie : sécurise sans restructurer (évite de casser le curseur / l’aperçu live). */
export function sanitizeEditorHtml(html: string, mode: RichEditorSanitizeMode = "email"): string {
  const normalized = normalizeEditorHtml(html);
  return mode === "note" ? sanitizeNoteHtml(normalized) : sanitizeTemplateEmailHtml(normalized);
}

export function sanitizeNoteEditorHtml(html: string): string {
  return sanitizeEditorHtml(html, "note");
}

/** Au blur / enregistrement : format Gmail (div par ligne). */
export function finalizeEditorHtmlForStorage(html: string): string {
  return canonicalizeTemplateCorpsHtml(html);
}

/** Lit le HTML courant de l'éditeur (DOM), y compris la dernière frappe non encore flushée en state. */
export function readRichTextEditorHtml(editorEl: HTMLDivElement | null): string {
  if (!editorEl) return "";
  const raw = editorEl.innerHTML.trim();
  if (!raw || raw === "<br>" || raw === "<div><br></div>") return "";

  const visibleText = (editorEl.textContent ?? "").replace(/\u00a0/g, " ").trim();
  if (!visibleText) return "";

  const finalized = finalizeEditorHtmlForStorage(raw);
  if (finalized.trim()) return finalized;

  const sanitized = sanitizeTemplateEmailHtml(raw);
  if (sanitized.trim()) return normalizeTemplateEmailHtmlLikeGmail(sanitized);

  const fallback = sanitizeEditorHtml(raw);
  return fallback.trim() ? fallback : "";
}

/** Restaure une sélection sauvegardée dans l'éditeur. */
export function restoreRichEditorSelection(
  editorEl: HTMLDivElement | null,
  savedRange: Range | null
): boolean {
  if (!editorEl || !savedRange) return false;
  if (!editorEl.contains(savedRange.commonAncestorContainer)) return false;
  const sel = window.getSelection();
  if (!sel) return false;
  sel.removeAllRanges();
  sel.addRange(savedRange);
  return true;
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

function findEditorAncestor(node: Node | null, tagNames: string[]): HTMLElement | null {
  const wanted = new Set(tagNames.map((t) => t.toUpperCase()));
  let current: Node | null = node;
  while (current && current.nodeType !== Node.DOCUMENT_NODE) {
    if (current.nodeType === Node.ELEMENT_NODE) {
      const el = current as HTMLElement;
      if (wanted.has(el.tagName)) return el;
    }
    current = current.parentNode;
  }
  return null;
}

function isEmptyListItem(li: HTMLElement): boolean {
  if (li.querySelector("img, table, ul, ol")) return false;
  const text = (li.textContent ?? "")
    .replace(/[\u200B\uFEFF]/g, "")
    .replace(/\u00a0/g, " ")
    .trim();
  if (text !== "") return false;
  const markup = li.innerHTML
    .replace(/<br\s*\/?>/gi, "")
    .replace(/<\/?div[^>]*>/gi, "")
    .replace(/<\/?span[^>]*>/gi, "")
    .replace(/&nbsp;/gi, "")
    .replace(/\s/g, "")
    .replace(/[\u200B\uFEFF]/g, "");
  return markup === "";
}

function placeCaretInLine(line: HTMLElement): void {
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  if (line.childNodes.length === 0) {
    line.appendChild(document.createElement("br"));
  }
  range.selectNodeContents(line);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

/** Sort d'une puce vide : nouvelle ligne normale après la liste (Entrée sur puce vide). */
function exitEmptyListItem(li: HTMLLIElement): void {
  const list = li.parentElement;
  if (!list || (list.tagName !== "UL" && list.tagName !== "OL")) return;

  const newLine = document.createElement("div");
  newLine.innerHTML = "<br>";

  if (list.children.length <= 1) {
    list.replaceWith(newLine);
  } else {
    list.insertAdjacentElement("afterend", newLine);
    li.remove();
  }

  placeCaretInLine(newLine);
}

/** Retire la mise en forme liste en conservant le texte (bouton barre d'outils). */
function removeListFormattingAtCursor(): void {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const li = findEditorAncestor(sel.anchorNode, ["LI"]);
  if (!li) return;
  const list = li.parentElement;
  if (!list) return;

  if (list.tagName === "OL") {
    document.execCommand("insertOrderedList", false);
  } else if (list.tagName === "UL") {
    document.execCommand("insertUnorderedList", false);
  }
}

/** Entrée sur une puce vide : sortir de la liste (comportement éditeur classique). */
export function handleRichEditorListEnter(
  editorEl: HTMLDivElement,
  event: KeyboardEvent
): boolean {
  if (event.key !== "Enter" || event.shiftKey) return false;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return false;
  if (!editorEl.contains(sel.anchorNode)) return false;

  const li = findEditorAncestor(sel.anchorNode, ["LI"]);
  if (!li || !isEmptyListItem(li)) return false;

  event.preventDefault();
  event.stopPropagation();
  exitEmptyListItem(li as HTMLLIElement);
  return true;
}

/** Quitte la liste à la position du curseur (barre d'outils). */
export function exitRichEditorList(
  editorEl: HTMLDivElement | null,
  savedRange?: Range | null
): void {
  if (!editorEl) return;
  editorEl.focus();
  restoreRichEditorSelection(editorEl, savedRange ?? saveRichEditorSelection(editorEl));
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const li = findEditorAncestor(sel.anchorNode, ["LI"]);
  if (!li) return;

  if (isEmptyListItem(li)) {
    exitEmptyListItem(li as HTMLLIElement);
  } else {
    removeListFormattingAtCursor();
  }
}

/** Applique une taille de police (px) à la sélection courante. */
export function applyRichEditorFontSize(
  editorEl: HTMLDivElement | null,
  sizePx: number,
  savedRange?: Range | null
): boolean {
  if (!editorEl || sizePx < 10 || sizePx > 48) return false;
  editorEl.focus();
  restoreRichEditorSelection(editorEl, savedRange ?? saveRichEditorSelection(editorEl));
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return false;
  const range = sel.getRangeAt(0);
  if (!editorEl.contains(range.commonAncestorContainer)) return false;

  const span = document.createElement("span");
  span.setAttribute("style", `font-size:${sizePx}px`);
  try {
    range.surroundContents(span);
  } catch {
    const contents = range.extractContents();
    span.appendChild(contents);
    range.insertNode(span);
  }
  sel.removeAllRanges();
  const next = document.createRange();
  next.selectNodeContents(span);
  sel.addRange(next);
  return true;
}

/** execCommand avec sélection restaurée (barre d'outils sans perdre la sélection). */
export function execRichEditorCommand(
  editorEl: HTMLDivElement | null,
  command: string,
  savedRange?: Range | null,
  valueArg?: string
): void {
  if (!editorEl) return;
  editorEl.focus();
  restoreRichEditorSelection(editorEl, savedRange ?? saveRichEditorSelection(editorEl));
  document.execCommand(command, false, valueArg);
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

/** Insère du HTML à la position du curseur (images, etc.). */
export function insertHtmlInRichEditor(
  editorEl: HTMLDivElement | null,
  html: string,
  savedRange?: Range | null,
  mode: RichEditorSanitizeMode = "email"
): boolean {
  if (!editorEl || !html.trim()) return false;
  editorEl.focus();
  restoreRichEditorSelection(editorEl, savedRange ?? saveRichEditorSelection(editorEl));
  document.execCommand("insertHTML", false, html);
  editorEl.innerHTML = sanitizeEditorHtml(normalizeEditorHtml(editorEl.innerHTML), mode);
  return true;
}
