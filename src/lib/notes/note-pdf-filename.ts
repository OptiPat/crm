const INVALID_FILENAME_CHARS = /[\\/:*?"<>|]/g;

export function sanitizeNoteFilenamePart(value: string): string {
  return value
    .replace(INVALID_FILENAME_CHARS, "-")
    .replace(/\s+/g, " ")
    .replace(/-+/g, "-")
    .replace(/(^-|-$)/g, "")
    .trim();
}

export function buildNotePdfFilenameStem(title: string): string {
  const safe = sanitizeNoteFilenamePart(title) || "Note";
  return `Note - ${safe}`;
}

export function buildNotePdfFilename(title: string): string {
  return `${buildNotePdfFilenameStem(title)}.pdf`;
}
