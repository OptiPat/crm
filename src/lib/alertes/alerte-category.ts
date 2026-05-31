/** Regroupement des types d'alerte pour filtres Suivi / Dashboard. */

export type AlerteCategory = "client" | "prospect" | "filleul" | "patrimoine";

export type AlerteCategoryFilter = "all" | AlerteCategory;

export const ALERTE_CATEGORY_OPTIONS: {
  id: AlerteCategoryFilter;
  label: string;
}[] = [
  { id: "all", label: "Toutes" },
  { id: "client", label: "Clients" },
  { id: "prospect", label: "Prospects" },
  { id: "filleul", label: "Filleuls" },
  { id: "patrimoine", label: "Patrimoine" },
];

const CLIENT_TYPES = new Set([
  "SUIVI_CLIENT_1AN",
  "SUIVI_CLIENT_ANNUEL",
  "CLIENT_JAMAIS_SUIVI",
]);

const PROSPECT_TYPES = new Set([
  "LEAD_SUIVI_6MOIS",
  "SUIVI_PROSPECT_6MOIS",
  "LEAD_JAMAIS_CONTACTE",
]);

const FILLEUL_TYPES = new Set([
  "SUIVI_FILLEUL_1AN",
  "FILLEUL_SUIVI_6MOIS",
  "FILLEUL_JAMAIS_CONTACTE",
]);

const PATRIMOINE_TYPES = new Set(["FIN_DEMEMBREMENT", "ANNIVERSAIRE"]);

export function getAlerteCategory(typeAlerte: string): AlerteCategory | null {
  if (CLIENT_TYPES.has(typeAlerte)) return "client";
  if (PROSPECT_TYPES.has(typeAlerte)) return "prospect";
  if (FILLEUL_TYPES.has(typeAlerte)) return "filleul";
  if (PATRIMOINE_TYPES.has(typeAlerte)) return "patrimoine";
  return null;
}

export function matchesAlerteCategoryFilter(
  typeAlerte: string,
  filter: AlerteCategoryFilter
): boolean {
  if (filter === "all") return true;
  return getAlerteCategory(typeAlerte) === filter;
}

export function countAlertesByCategory<T extends { type_alerte: string }>(
  alertes: T[]
): Record<AlerteCategoryFilter, number> {
  const counts: Record<AlerteCategoryFilter, number> = {
    all: alertes.length,
    client: 0,
    prospect: 0,
    filleul: 0,
    patrimoine: 0,
  };
  for (const a of alertes) {
    const cat = getAlerteCategory(a.type_alerte);
    if (cat) counts[cat] += 1;
  }
  return counts;
}
