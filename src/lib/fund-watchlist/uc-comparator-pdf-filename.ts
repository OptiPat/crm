function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function sanitizeFilenamePart(value: string, maxLen: number): string {
  const cleaned = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.slice(0, maxLen) || "fonds";
}

export function shortenFundNameForPdf(nom: string): string {
  return nom
    .replace(/\s+(A-DIST-EUR|A\(acc\)EUR|A EUR Acc|P EUR|B EUR|A EUR|Acc|EUR).*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildUcComparatorPdfFilename(
  fundNames: string[],
  generatedAt: number
): string {
  const date = new Date(generatedAt * 1000);
  const yyyy = date.getFullYear();
  const mm = pad2(date.getMonth() + 1);
  const dd = pad2(date.getDate());
  const labels = fundNames
    .map(shortenFundNameForPdf)
    .map((name) => sanitizeFilenamePart(name, 32))
    .filter(Boolean);
  const fundsPart =
    labels.length > 0 ? labels.join(" vs ") : "Comparatif";
  return `Comparatif UC - ${sanitizeFilenamePart(fundsPart, 96)} - ${yyyy}-${mm}-${dd}.pdf`;
}

export function buildUcComparatorPdfFilenameStem(
  fundNames: string[],
  generatedAt: number
): string {
  return buildUcComparatorPdfFilename(fundNames, generatedAt).replace(/\.pdf$/i, "");
}
