const INVALID_FILENAME_CHARS = /[\\/:*?"<>|]/g;

export function buildFundWatchlistCoachPdfFilename(generatedAt: number): string {
  const date = new Date(generatedAt * 1000);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `Rapport Coach Veille fonds - ${yyyy}-${mm}-${dd}.pdf`;
}

export function buildFundWatchlistCoachPdfFilenameStem(generatedAt: number): string {
  return buildFundWatchlistCoachPdfFilename(generatedAt).replace(/\.pdf$/i, "");
}

export function sanitizeCoachPdfText(value: string): string {
  return value.replace(INVALID_FILENAME_CHARS, "-").trim();
}
