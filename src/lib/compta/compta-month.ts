export function formatComptaMonthLabel(year: number, month: number): string {
  const label = new Date(year, month - 1, 1).toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function shiftComptaMonth(
  year: number,
  month: number,
  delta: number
): { year: number; month: number } {
  const d = new Date(year, month - 1 + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

export function todayDateInput(): string {
  return new Date().toISOString().split("T")[0]!;
}

export function formatComptaDateFr(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return isoDate;
  return new Date(y, m - 1, d).toLocaleDateString("fr-FR");
}

/** Noms de dossiers Drive : « Juillet 2026 - Encaissements » */
export function comptaDriveFolderName(
  year: number,
  month: number,
  kind: "Encaissements" | "Dépenses"
): string {
  const monthLabel = new Date(year, month - 1, 1).toLocaleDateString("fr-FR", {
    month: "long",
  });
  const monthCapitalized =
    monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);
  return `${monthCapitalized} ${year} - ${kind}`;
}
