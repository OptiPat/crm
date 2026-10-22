import type {
  ComptaDepense,
  ComptaDeplacement,
  ComptaEncaissement,
} from "@/lib/api/tauri-compta";
import {
  buildComptaJournalEntries,
  comptaJournalTypeLabel,
} from "@/lib/compta/compta-journal";
import {
  downloadCsvFile,
  formatCsvDecimal,
  rowsToCsv,
} from "@/lib/export/csv-export";

export const COMPTA_JOURNAL_CSV_HEADERS = [
  "Date",
  "Type",
  "Libellé",
  "HT",
  "TVA",
  "TTC",
  "Don",
  "Lien Drive",
] as const;

/** Contenu CSV du journal (séparateur « ; », virgule décimale, BOM UTF-8). */
export function buildComptaJournalCsv(input: {
  depenses: ComptaDepense[];
  encaissements: ComptaEncaissement[];
  deplacements: ComptaDeplacement[];
}): string {
  const entries = buildComptaJournalEntries(
    input.encaissements,
    input.depenses,
    input.deplacements
  );
  const rows = entries.map((e) => [
    e.date,
    comptaJournalTypeLabel(e.type),
    e.libelle,
    formatCsvDecimal(e.ht),
    formatCsvDecimal(e.tva),
    formatCsvDecimal(e.ttc),
    e.don > 0 ? formatCsvDecimal(e.don) : "",
    e.lienDrive ?? "",
  ]);
  return rowsToCsv([...COMPTA_JOURNAL_CSV_HEADERS], rows);
}

export function exportComptaJournalCsv(input: {
  year: number;
  month: number;
  depenses: ComptaDepense[];
  encaissements: ComptaEncaissement[];
  deplacements: ComptaDeplacement[];
}): void {
  downloadCsvFile(
    `compta-journal-${input.year}-${String(input.month).padStart(2, "0")}.csv`,
    buildComptaJournalCsv(input)
  );
}
