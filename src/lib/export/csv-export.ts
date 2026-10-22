/** Export CSV UTF-8 avec BOM pour Excel (séparateur ; en locale FR). */

function escapeCell(value: string | number | null | undefined): string {
  if (value == null) return "";
  const s = String(value);
  if (/[;"\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Nombre décimal lisible par Excel en français : virgule décimale,
 * sans séparateur de milliers. Ex. 1234.5 → « 1234,50 ».
 */
export function formatCsvDecimal(value: number, fractionDigits = 2): string {
  return value.toFixed(fractionDigits).replace(".", ",");
}

export function rowsToCsv(
  headers: string[],
  rows: (string | number | null | undefined)[][],
  separator = ";"
): string {
  const lines = [
    headers.map(escapeCell).join(separator),
    ...rows.map((row) => row.map(escapeCell).join(separator)),
  ];
  return `\uFEFF${lines.join("\r\n")}`;
}

export function downloadCsvFile(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
