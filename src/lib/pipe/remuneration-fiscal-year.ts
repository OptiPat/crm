/** Année fiscale rémunération : 01/08 → 31/07 (ex. « 2025-2026 »). */

export function fiscalYearLabelForUnix(ts: number): string {
  return fiscalYearLabelForDate(new Date(ts * 1000));
}

export function fiscalYearLabelForDate(date: Date): string {
  const year = date.getFullYear();
  const month = date.getMonth(); // 0 = janvier, 7 = août
  if (month >= 7) return `${year}-${year + 1}`;
  return `${year - 1}-${year}`;
}

export function fiscalYearStartUnix(label: string): number | null {
  const match = /^(\d{4})-(\d{4})$/.exec(label.trim());
  if (!match) return null;
  const startYear = Number(match[1]);
  if (!Number.isFinite(startYear)) return null;
  return Math.floor(new Date(startYear, 7, 1, 0, 0, 0, 0).getTime() / 1000);
}

export function fiscalYearEndUnix(label: string): number | null {
  const match = /^(\d{4})-(\d{4})$/.exec(label.trim());
  if (!match) return null;
  const endYear = Number(match[2]);
  if (!Number.isFinite(endYear)) return null;
  return Math.floor(new Date(endYear, 6, 31, 23, 59, 59, 999).getTime() / 1000);
}

export function currentFiscalYearLabel(now = new Date()): string {
  return fiscalYearLabelForDate(now);
}

/** Liste des années fiscales affichables (courante ± 2). */
export function listSelectableFiscalYearLabels(now = new Date()): string[] {
  const current = fiscalYearLabelForDate(now);
  const startYear = Number(current.split("-")[0]);
  const labels: string[] = [];
  for (let offset = -2; offset <= 2; offset += 1) {
    const y = startYear + offset;
    labels.push(`${y}-${y + 1}`);
  }
  return labels;
}
