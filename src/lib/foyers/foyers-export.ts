import type { FoyerRow } from "@/lib/foyers/foyers-search";
import { getFoyerTypeLabel } from "@/lib/foyers/foyer-display";
import { formatEuroCentimes } from "@/lib/investissements/investissement-display";
function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function buildFoyerMembersCsv(row: FoyerRow): string {
  const { foyer, membres, patrimoineAvecMoi } = row;
  const header = [
    "Foyer",
    "Type",
    "Prénom",
    "Nom",
    "Rôle foyer",
    "Email",
    "Téléphone",
  ];
  const rows: string[][] = [header];

  for (const contact of membres) {
    rows.push([
      foyer.nom,
      getFoyerTypeLabel(foyer.type_foyer),
      contact.prenom ?? "",
      contact.nom ?? "",
      contact.role_foyer ?? "",
      contact.email ?? "",
      contact.telephone ?? "",
    ]);
  }

  if (membres.length === 0) {
    rows.push([
      foyer.nom,
      getFoyerTypeLabel(foyer.type_foyer),
      "",
      "",
      "",
      "",
      "",
    ]);
  }

  rows.push([
    "Patrimoine avec moi (foyer)",
    formatEuroCentimes(patrimoineAvecMoi),
    "",
    "",
    "",
    "",
    "",
  ]);

  return rows.map((r) => r.map(csvCell).join(";")).join("\n");
}

export function downloadFoyerMembersCsv(row: FoyerRow): void {
  const csv = buildFoyerMembersCsv(row);
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `foyer-${row.foyer.nom.slice(0, 40).replace(/[^\w-]/g, "") || "membres"}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}
