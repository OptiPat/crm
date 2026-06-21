import type { PartenaireRow } from "@/lib/partenaires/partenaires-search";
import { getPartenaireTypeInfo } from "@/lib/partenaires/partenaire-display";
import { formatEuroCentimes } from "@/lib/investissements/investissement-display";
import { formatPartenaireProductOwnerCsv } from "@/lib/partenaires/partenaires-product-owner";
import { getEffectiveEncoursCentimes } from "@/lib/investissements/investissement-encours";

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function buildPartenaireProductsCsv(
  row: PartenaireRow,
  contactLabelById: Record<number, string>,
  foyerLabelById: Record<number, string>
): string {
  const header = [
    "Partenaire",
    "Type partenaire",
    "Type produit",
    "Nom produit",
    "Détenteur",
    "Encours",
    "Origine",
  ];
  const rows: string[][] = [header];
  const typeLabel = getPartenaireTypeInfo(row.partenaire.type_partenaire).label;

  if (row.investissements.length === 0) {
    rows.push([row.partenaire.raison_sociale, typeLabel, "", "", "", "", ""]);
  } else {
    for (const inv of row.investissements) {
      const detenteur = formatPartenaireProductOwnerCsv(
        inv,
        contactLabelById,
        foyerLabelById
      );
      rows.push([
        row.partenaire.raison_sociale,
        typeLabel,
        inv.type_produit?.replace(/_/g, " ") ?? "",
        inv.nom_produit ?? "",
        detenteur,
        formatEuroCentimes(getEffectiveEncoursCentimes(inv)),
        inv.origine ?? "",
      ]);
    }
  }

  rows.push([
    "Encours avec moi (partenaire)",
    formatEuroCentimes(row.meta.encoursAvecMoi),
    "",
    "",
    "",
    "",
    "",
  ]);

  return rows.map((r) => r.map(csvCell).join(";")).join("\n");
}

export function downloadPartenaireProductsCsv(
  row: PartenaireRow,
  contactLabelById: Record<number, string>,
  foyerLabelById: Record<number, string>
): void {
  const csv = buildPartenaireProductsCsv(row, contactLabelById, foyerLabelById);
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `partenaire-${row.partenaire.raison_sociale.slice(0, 40).replace(/[^\w-]/g, "") || "produits"}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}
