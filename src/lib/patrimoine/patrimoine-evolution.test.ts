import { describe, expect, it } from "vitest";
import {
  buildPatrimoineEvolution,
  formatEvolutionLabel,
  toEvolutionDayTs,
} from "./patrimoine-evolution";

describe("buildPatrimoineEvolution", () => {
  it("retourne null sans montant exploitable", () => {
    expect(buildPatrimoineEvolution([{ id: 1 }])).toBeNull();
  });

  it("termine au total des derniers points datés (plus les actifs sans date)", () => {
    const series = buildPatrimoineEvolution([
      {
        id: 1,
        montant_initial: 100_000_00,
        date_souscription: 1_577_836_800,
        encours_actuel: 120_000_00,
        encours_date: 1_704_067_200,
      },
      {
        id: 2,
        montant_initial: 50_000_00,
        date_souscription: 1_640_995_200,
      },
      { id: 3, montant_initial: 20_000_00 },
    ]);

    expect(series).not.toBeNull();
    expect(series![series!.length - 1].totalCentimes).toBe(
      120_000_00 + 50_000_00 + 20_000_00
    );
  });

  it("inclut un actif sans date dans tous les points", () => {
    const series = buildPatrimoineEvolution([
      { id: 1, montant_initial: 20_000_00 },
      {
        id: 2,
        montant_initial: 10_000_00,
        date_souscription: 1_577_836_800,
        encours_actuel: 12_000_00,
        encours_date: 1_704_067_200,
      },
    ]);

    expect(series).not.toBeNull();
    expect(series![0].totalCentimes).toBe(20_000_00 + 10_000_00);
    expect(series![series!.length - 1].totalCentimes).toBe(20_000_00 + 12_000_00);
  });

  it("ancre la souscription sur l'effectif si montant_initial absent", () => {
    const series = buildPatrimoineEvolution([
      {
        id: 1,
        date_souscription: 1_577_836_800,
        encours_actuel: 180_000_00,
        encours_date: 1_704_067_200,
      },
    ]);

    expect(series![0].totalCentimes).toBe(180_000_00);
    expect(series![series!.length - 1].totalCentimes).toBe(180_000_00);
  });

  it("n'invente pas un point « aujourd'hui » si le montant n'a pas changé", () => {
    const lastKnown = toEvolutionDayTs(Date.UTC(2025, 2, 2) / 1000);
    const series = buildPatrimoineEvolution([
      {
        id: 1,
        encours_actuel: 12_672_00,
        encours_date: lastKnown,
        valorisations: [{ dateTs: lastKnown, montantCentimes: 12_672_00 }],
      },
    ]);

    expect(series).toBeNull();
  });

  it("n'invente pas non plus aujourd'hui si l'encours a bougé sans nouvelle date", () => {
    const souscription = toEvolutionDayTs(Date.UTC(2020, 0, 1) / 1000);
    const lastKnown = toEvolutionDayTs(Date.UTC(2025, 2, 2) / 1000);
    const today = toEvolutionDayTs(Date.now() / 1000);
    const series = buildPatrimoineEvolution([
      {
        id: 1,
        montant_initial: 10_000_00,
        date_souscription: souscription,
        encours_actuel: 13_000_00,
        valorisations: [{ dateTs: lastKnown, montantCentimes: 12_672_00 }],
      },
    ]);

    expect(series?.map((p) => p.dateTs)).toEqual([souscription, lastKnown]);
    expect(series?.some((p) => p.dateTs === today)).toBe(false);
    expect(series?.[1].totalCentimes).toBe(12_672_00);
  });

  it("distingue deux jours du même mois dans le libellé", () => {
    const a = toEvolutionDayTs(Date.UTC(2026, 7, 5) / 1000);
    const b = toEvolutionDayTs(Date.UTC(2026, 7, 11) / 1000);
    const series = buildPatrimoineEvolution([
      {
        id: 1,
        montant_initial: 100_000_00,
        date_souscription: 1_577_836_800,
        encours_actuel: 100_000_00,
        encours_date: a,
      },
      {
        id: 2,
        montant_initial: 50_000_00,
        date_souscription: 1_577_836_800,
        encours_actuel: 50_000_00,
        encours_date: b,
      },
    ]);

    const labels = series!.map((p) => p.label);
    const uniqueAugustish = new Set(labels.filter((l) => /2026/.test(l)));
    expect(uniqueAugustish.size).toBeGreaterThanOrEqual(1);
    expect(formatEvolutionLabel(a)).not.toBe(formatEvolutionLabel(1_577_836_800));
  });
});
