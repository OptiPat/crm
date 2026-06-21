import type { FamilleGroup } from "@/lib/familles/famille-types";
import { formatEuroCentimes } from "@/lib/investissements/investissement-display";

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function buildFamilleMembersCsv(famille: FamilleGroup): string {
  const rows: string[][] = [
    [
      "Famille",
      "Type",
      "Prénom",
      "Nom",
      "Rôle",
      "Conjoint de",
      "Patrimoine avec moi",
      "Patrimoine total",
    ],
  ];

  for (const membre of famille.membres) {
    const c = membre.contact;
    rows.push([
      famille.nom,
      famille.isManual ? "Manuelle" : "Automatique",
      c.prenom ?? "",
      c.nom ?? "",
      membre.isSpouse ? "Conjoint(e)" : (c.role_famille ?? ""),
      membre.spouseOf ?? "",
      formatEuroCentimes(membre.avecMoiTotal),
      formatEuroCentimes(membre.patrimoine),
    ]);
  }

  return rows.map((row) => row.map(csvCell).join(";")).join("\n");
}

export function downloadFamilleMembersCsv(famille: FamilleGroup): void {
  const csv = buildFamilleMembersCsv(famille);
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `famille-${famille.nom.slice(0, 40).replace(/[^\w-]/g, "") || "membres"}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}
