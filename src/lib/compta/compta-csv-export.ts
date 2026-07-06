import type {
  ComptaDepense,
  ComptaDeplacement,
  ComptaEncaissement,
} from "@/lib/api/tauri-compta";
import {
  buildComptaJournalEntries,
  comptaJournalTypeLabel,
} from "@/lib/compta/compta-journal";

function csvCell(value: string | number): string {
  const text = String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function exportComptaJournalCsv(input: {
  year: number;
  month: number;
  depenses: ComptaDepense[];
  encaissements: ComptaEncaissement[];
  deplacements: ComptaDeplacement[];
}): void {
  const entries = buildComptaJournalEntries(
    input.encaissements,
    input.depenses,
    input.deplacements
  );
  const header = [
    "Date",
    "Type",
    "Libellé",
    "HT",
    "TVA",
    "TTC",
    "Don",
    "Lien Drive",
  ];
  const rows = entries.map((e) =>
    [
      e.date,
      comptaJournalTypeLabel(e.type),
      e.libelle,
      e.ht.toFixed(2),
      e.tva.toFixed(2),
      e.ttc.toFixed(2),
      e.don > 0 ? e.don.toFixed(2) : "",
      e.lienDrive ?? "",
    ]
      .map(csvCell)
      .join(",")
  );
  const csv = `\uFEFF${header.join(",")}\n${rows.join("\n")}`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `compta-journal-${input.year}-${String(input.month).padStart(2, "0")}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}
