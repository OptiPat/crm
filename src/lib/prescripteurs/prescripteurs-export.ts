import type { PrescripteurNode } from "@/lib/prescripteurs/prescripteur-tree";
import {
  getContactDisplayName,
  type FoyerInfo,
} from "@/lib/prescripteurs/prescripteur-tree";
import { formatEuroCentimes } from "@/lib/investissements/investissement-display";

function csvCell(value: string): string {
  const escaped = value.replace(/"/g, '""');
  return `"${escaped}"`;
}

function flattenTreeRows(
  node: PrescripteurNode,
  foyersInfo: Record<number, FoyerInfo>,
  rootLabel: string,
  rows: string[][]
): void {
  rows.push([
    rootLabel,
    String(node.niveau),
    getContactDisplayName(node.contact, foyersInfo),
    node.contact.categorie ?? "",
    formatEuroCentimes(node.patrimoine),
    String(node.clientsRecommandes.length),
  ]);
  for (const child of node.clientsRecommandes) {
    flattenTreeRows(child, foyersInfo, rootLabel, rows);
  }
}

export function buildPrescripteurNetworkCsv(
  root: PrescripteurNode,
  foyersInfo: Record<number, FoyerInfo>
): string {
  const rootLabel = getContactDisplayName(root.contact, foyersInfo);
  const rows: string[][] = [
    ["Racine", "Niveau", "Contact", "Catégorie", "Patrimoine avec moi", "Clients directs"],
  ];
  flattenTreeRows(root, foyersInfo, rootLabel, rows);
  return rows.map((row) => row.map(csvCell).join(";")).join("\n");
}

export function downloadPrescripteurNetworkCsv(
  root: PrescripteurNode,
  foyersInfo: Record<number, FoyerInfo>
): void {
  const csv = buildPrescripteurNetworkCsv(root, foyersInfo);
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const safeName = getContactDisplayName(root.contact, foyersInfo)
    .replace(/[^\w\s-]/g, "")
    .trim()
    .slice(0, 40);
  anchor.href = url;
  anchor.download = `prescripteur-${safeName || "reseau"}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}
