import type { Investissement } from "@/lib/api/tauri-investissements";
import { getEffectiveEncoursCentimes } from "@/lib/investissements/investissement-encours";
import {
  getPatrimoineCategorie,
  PATRIMOINE_CATEGORIE_COLORS,
  PATRIMOINE_CATEGORIE_ORDER,
  type PatrimoineCategorie,
} from "./categories";
import {
  DISPONIBILITE_CHART_COLORS,
  formatDisponibiliteLabel,
  getDisponibiliteHorizon,
  HORIZON_LABEL_ORDER,
} from "./disponibilite";

function sortChartSlicesByValue(
  slices: PatrimoineChartSlice[]
): PatrimoineChartSlice[] {
  return [...slices].sort((a, b) => b.value - a.value);
}

export interface PatrimoineChartSlice {
  name: string;
  value: number;
  color: string;
}

export function aggregateByCategorie(
  investissements: Investissement[]
): PatrimoineChartSlice[] {
  const totals = new Map<PatrimoineCategorie, number>();
  for (const inv of investissements) {
    const cat = getPatrimoineCategorie(inv.type_produit);
    const amount = getEffectiveEncoursCentimes(inv);
    if (amount <= 0) continue;
    totals.set(cat, (totals.get(cat) ?? 0) + amount);
  }
  return sortChartSlicesByValue(
    PATRIMOINE_CATEGORIE_ORDER.filter((c) => (totals.get(c) ?? 0) > 0).map(
      (cat) => ({
        name: cat,
        value: totals.get(cat) ?? 0,
        color: PATRIMOINE_CATEGORIE_COLORS[cat],
      })
    )
  );
}

export function aggregateByDisponibilite(
  investissements: Investissement[]
): PatrimoineChartSlice[] {
  const totals = new Map<string, number>();
  for (const inv of investissements) {
    const horizon = getDisponibiliteHorizon({ type_produit: inv.type_produit });
    const label = formatDisponibiliteLabel(horizon);
    const amount = getEffectiveEncoursCentimes(inv);
    if (amount <= 0) continue;
    totals.set(label, (totals.get(label) ?? 0) + amount);
  }
  return sortChartSlicesByValue(
    HORIZON_LABEL_ORDER.filter((label) => (totals.get(label) ?? 0) > 0).map(
      (name) => ({
        name,
        value: totals.get(name) ?? 0,
        color: DISPONIBILITE_CHART_COLORS[name] ?? "#525252",
      })
    )
  );
}
