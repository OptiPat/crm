const INVALID_FILENAME_CHARS = /[\\/:*?"<>|]/g;

/** Segment sûr pour un nom de fichier Windows. */
export function sanitizeFilenamePart(value: string): string {
  return value.replace(INVALID_FILENAME_CHARS, "-").replace(/\s+/g, " ").trim();
}

/** Ex. « Lettre de mission - Jean Dupont » (sans extension, pour document.title / boîte Enregistrer PDF). */
export function buildCifPdfFilenameStem(documentLabel: string, clientDisplayName: string): string {
  const doc = sanitizeFilenamePart(documentLabel) || "Document";
  const client = sanitizeFilenamePart(clientDisplayName) || "Client";
  return `${doc} - ${client}`;
}

/** Ex. « Lettre de mission - Jean Dupont.pdf » */
export function buildCifPdfFilename(documentLabel: string, clientDisplayName: string): string {
  return `${buildCifPdfFilenameStem(documentLabel, clientDisplayName)}.pdf`;
}
