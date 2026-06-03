export type TextFieldSelection = {
  start: number;
  end: number;
};

/** Insère du texte dans une chaîne à la position du curseur (ou en fin si absent). */
export function insertTextInPlainField(
  value: string,
  text: string,
  selection?: TextFieldSelection | null
): { value: string; caret: number } {
  const start = selection?.start ?? value.length;
  const end = selection?.end ?? value.length;
  const next = `${value.slice(0, start)}${text}${value.slice(end)}`;
  return { value: next, caret: start + text.length };
}

/**
 * Insère du texte dans un <input> à la sélection indiquée (execCommand natif).
 * Retourne la nouvelle valeur ou null si échec.
 */
export function insertTextInInputElement(
  input: HTMLInputElement,
  text: string,
  selection: TextFieldSelection
): { value: string; caret: number } | null {
  input.focus();
  input.setSelectionRange(selection.start, selection.end);
  const inserted = document.execCommand("insertText", false, text);
  if (!inserted) return null;
  const caret = input.selectionStart ?? input.value.length;
  return { value: input.value, caret };
}
