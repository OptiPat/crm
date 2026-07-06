import { describe, expect, it } from "vitest";
import {
  comptaBilanMonthsToLoad,
  computeComptaAnnualSummary,
  computeComptaExpensesByCategory,
  computeComptaMonthlyEvolution,
} from "./compta-bilan";
import type { ComptaDepense, ComptaDeplacement, ComptaEncaissement } from "@/lib/api/tauri-compta";

const enc: ComptaEncaissement[] = [
  {
    id: 1,
    client: "CLIENT A",
    date: "2026-03-15",
    exonere: 100,
    ht: 400,
    tva: 80,
    ttc: 480,
    total: 580,
    don: 0,
    isPartenaire: false,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 2,
    client: "CLIENT B",
    date: "2026-07-01",
    exonere: 0,
    ht: 200,
    tva: 40,
    ttc: 240,
    total: 240,
    don: 0,
    isPartenaire: false,
    createdAt: 0,
    updatedAt: 0,
  },
];

const dep: ComptaDepense[] = [
  {
    id: 1,
    date: "2026-03-20",
    categorie: "Logiciel",
    tiers: "GitHub",
    ttc: 48,
    tva: 0,
    ht: 48,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 2,
    date: "2026-06-10",
    categorie: "Relevé de compte",
    tiers: "La Banque Postale",
    ttc: 0,
    tva: 0,
    ht: 0,
    createdAt: 0,
    updatedAt: 0,
  },
];

const depl: ComptaDeplacement[] = [
  {
    id: 1,
    date: "2026-05-12",
    destination: "Toulouse",
    objet: "RDV",
    km: 100,
    indemnite: 40.5,
    createdAt: 0,
    updatedAt: 0,
  },
];

describe("compta-bilan", () => {
  it("calcule le bilan annuel HT", () => {
    const summary = computeComptaAnnualSummary(enc, dep, depl, 2026);
    expect(summary.caHT).toBe(700);
    expect(summary.depensesHT).toBe(48);
    expect(summary.indemnitesKm).toBe(40.5);
    expect(summary.resultatNet).toBeCloseTo(611.5);
  });

  it("agrège 6 mois glissants en TTC", () => {
    const points = computeComptaMonthlyEvolution(enc, dep, 2026, 7);
    expect(points).toHaveLength(6);
    const july = points.find((p) => p.key === "2026-07");
    expect(july?.encaissementsTTC).toBe(240);
    const march = points.find((p) => p.key === "2026-03");
    expect(march?.depensesTTC).toBe(48);
  });

  it("exclut les relevés de compte du camembert", () => {
    const slices = computeComptaExpensesByCategory(dep);
    expect(slices).toHaveLength(1);
    expect(slices[0]?.categorie).toBe("Logiciel");
  });

  it("charge année + fenêtre glissante sans doublon", () => {
    const months = comptaBilanMonthsToLoad(2026, 3);
    expect(months.filter((m) => m.year === 2026 && m.month === 1)).toHaveLength(1);
    expect(months.some((m) => m.year === 2025 && m.month === 10)).toBe(true);
  });
});
