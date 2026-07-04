import { IMMOBILIER_TYPES } from "@/lib/investissements/investissement-display";

export type DashboardProductFamilyId =
  | "SCPI"
  | "PER"
  | "CAPITAL_INVEST"
  | "G3F"
  | "IMMOBILIER"
  | "EPARGNE_FINANCIERE"
  | "AUTRES";

export interface DashboardProductFamilyStat {
  id: DashboardProductFamilyId;
  name: string;
  montant: number;
  color: string;
}

const SCPI_TYPES = new Set(["SCPI", "SCPI_DEMEMBREMENT", "SCPI_FISCALE"]);

const CAPITAL_INVEST_TYPES = new Set([
  "FIP_FCPI",
  "FIP",
  "FCPI",
  "FCPR",
  "FPCI",
  "FPCR",
]);

const EPARGNE_FINANCIERE_TYPES = new Set([
  "ASSURANCE_VIE",
  "CONTRAT_CAPITALISATION",
  "PREVOYANCE",
]);

const IMMOBILIER_TYPE_SET = new Set<string>(IMMOBILIER_TYPES);

export const DASHBOARD_PRODUCT_FAMILY_META: Record<
  DashboardProductFamilyId,
  { name: string; color: string }
> = {
  SCPI: { name: "SCPI", color: "#C9A227" },
  PER: { name: "PER", color: "#8B5CF6" },
  CAPITAL_INVEST: { name: "Capital invest", color: "#3B82F6" },
  G3F: { name: "G3F", color: "#F59E0B" },
  IMMOBILIER: { name: "Immobilier", color: "#059669" },
  EPARGNE_FINANCIERE: { name: "Épargne financière", color: "#F43F5E" },
  AUTRES: { name: "Autres", color: "#6B7280" },
};

/** Famille dashboard pour un `type_produit` brut (SQL / API). */
export function resolveDashboardProductFamily(
  typeProduit: string | undefined | null
): DashboardProductFamilyId {
  const type = (typeProduit ?? "AUTRE").trim().toUpperCase();
  if (!type || type === "AUTRE") return "AUTRES";
  if (SCPI_TYPES.has(type)) return "SCPI";
  if (type === "PER") return "PER";
  if (CAPITAL_INVEST_TYPES.has(type)) return "CAPITAL_INVEST";
  if (type === "G3F") return "G3F";
  if (IMMOBILIER_TYPE_SET.has(type)) return "IMMOBILIER";
  if (EPARGNE_FINANCIERE_TYPES.has(type)) return "EPARGNE_FINANCIERE";
  return "AUTRES";
}

/** Agrège les stats API par famille (montants en euros). */
export function aggregateProductStatsByFamily(
  stats: { type_produit: string; montant: number }[]
): DashboardProductFamilyStat[] {
  const totals = new Map<DashboardProductFamilyId, number>();

  for (const row of stats) {
    if (row.montant <= 0) continue;
    const family = resolveDashboardProductFamily(row.type_produit);
    totals.set(family, (totals.get(family) ?? 0) + row.montant);
  }

  return [...totals.entries()]
    .map(([id, montant]) => ({
      id,
      name: DASHBOARD_PRODUCT_FAMILY_META[id].name,
      color: DASHBOARD_PRODUCT_FAMILY_META[id].color,
      montant,
    }))
    .sort((a, b) => b.montant - a.montant);
}
