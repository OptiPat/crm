import type {
  ComptaDepense,
  ComptaDeplacement,
  ComptaEncaissement,
} from "@/lib/api/tauri-compta";
import { shiftComptaMonth } from "@/lib/compta/compta-month";

export interface ComptaAnnualSummary {
  year: number;
  caHT: number;
  depensesHT: number;
  indemnitesKm: number;
  resultatNet: number;
}

export interface ComptaMonthlyEvolutionPoint {
  key: string;
  label: string;
  encaissementsTTC: number;
  depensesTTC: number;
}

export interface ComptaExpenseCategorySlice {
  categorie: string;
  ttc: number;
}

const yearPrefix = (year: number) => String(year);

export function filterByYear<T extends { date: string }>(items: T[], year: number): T[] {
  const prefix = yearPrefix(year);
  return items.filter((item) => item.date.startsWith(prefix));
}

export function computeComptaAnnualSummary(
  encaissements: ComptaEncaissement[],
  depenses: ComptaDepense[],
  deplacements: ComptaDeplacement[],
  year: number
): ComptaAnnualSummary {
  const enc = filterByYear(encaissements, year);
  const dep = filterByYear(depenses, year);
  const depl = filterByYear(deplacements, year);

  const caHT = enc.reduce((sum, e) => sum + e.ht + e.exonere, 0);
  const depensesHT = dep.reduce((sum, d) => sum + d.ht, 0);
  const indemnitesKm = depl.reduce((sum, d) => sum + d.indemnite, 0);

  return {
    year,
    caHT,
    depensesHT,
    indemnitesKm,
    resultatNet: caHT - depensesHT - indemnitesKm,
  };
}

/** 6 derniers mois se terminant au mois sélectionné (comme ComptaZen). */
export function computeComptaMonthlyEvolution(
  encaissements: ComptaEncaissement[],
  depenses: ComptaDepense[],
  endYear: number,
  endMonth: number
): ComptaMonthlyEvolutionPoint[] {
  const points: ComptaMonthlyEvolutionPoint[] = [];

  for (let i = 5; i >= 0; i--) {
    const { year, month } = shiftComptaMonth(endYear, endMonth, -i);
    const key = `${year}-${String(month).padStart(2, "0")}`;
    const label = new Date(year, month - 1, 1).toLocaleDateString("fr-FR", {
      month: "short",
      year: "2-digit",
    });

    const encaissementsTTC = encaissements
      .filter((e) => e.date.startsWith(key))
      .reduce((sum, e) => sum + e.total, 0);
    const depensesTTC = depenses
      .filter((d) => d.date.startsWith(key))
      .reduce((sum, d) => sum + d.ttc, 0);

    points.push({ key, label, encaissementsTTC, depensesTTC });
  }

  return points;
}

/** Répartition TTC par catégorie (toutes périodes, hors relevés vides). */
export function computeComptaExpensesByCategory(
  depenses: ComptaDepense[]
): ComptaExpenseCategorySlice[] {
  const totals = new Map<string, number>();

  for (const dep of depenses) {
    if (dep.categorie === "Relevé de compte") continue;
    const cat = dep.categorie.trim() || "Autre";
    totals.set(cat, (totals.get(cat) ?? 0) + dep.ttc);
  }

  return [...totals.entries()]
    .map(([categorie, ttc]) => ({ categorie, ttc }))
    .filter((row) => row.ttc > 0)
    .sort((a, b) => b.ttc - a.ttc);
}

/** Mois à charger pour le bilan (année complète + fenêtre glissante 6 mois). */
export function comptaBilanMonthsToLoad(
  year: number,
  month: number
): Array<{ year: number; month: number }> {
  const seen = new Set<string>();
  const result: Array<{ year: number; month: number }> = [];

  const add = (y: number, m: number) => {
    const key = `${y}-${m}`;
    if (seen.has(key)) return;
    seen.add(key);
    result.push({ year: y, month: m });
  };

  for (let m = 1; m <= 12; m++) add(year, m);
  for (let i = 5; i >= 0; i--) {
    const shifted = shiftComptaMonth(year, month, -i);
    add(shifted.year, shifted.month);
  }

  return result;
}
