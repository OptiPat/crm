import { describe, expect, it } from "vitest";
import {
  buildPatrimoineEvolution,
  formatEvolutionLabel,
  toEvolutionDayTs,
} from "./patrimoine-evolution";

const AS_OF = 1_800_000_000; // point courant figé pour les tests

describe("buildPatrimoineEvolution", () => {
  it("retourne null sans montant exploitable", () => {
    expect(buildPatrimoineEvolution([{ id: 1 }], { asOfUnix: AS_OF })).toBeNull();
  });

  it("termine au total effectif (inventaire)", () => {
    const series = buildPatrimoineEvolution(
      [
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
      ],
      { asOfUnix: AS_OF }
    );

    expect(series).not.toBeNull();
    expect(series![series!.length - 1].totalCentimes).toBe(
      120_000_00 + 50_000_00 + 20_000_00
    );
  });

  it("inclut un actif sans date dans tous les points", () => {
    const series = buildPatrimoineEvolution(
      [
        { id: 1, montant_initial: 20_000_00 },
        {
          id: 2,
          montant_initial: 10_000_00,
          date_souscription: 1_577_836_800,
          encours_actuel: 12_000_00,
          encours_date: 1_704_067_200,
        },
      ],
      { asOfUnix: AS_OF }
    );

    expect(series).not.toBeNull();
    expect(series![0].totalCentimes).toBe(20_000_00 + 10_000_00);
    expect(series![series!.length - 1].totalCentimes).toBe(20_000_00 + 12_000_00);
  });

  it("ancre la souscription sur l'effectif si montant_initial absent", () => {
    const series = buildPatrimoineEvolution(
      [
        {
          id: 1,
          date_souscription: 1_577_836_800,
          encours_actuel: 180_000_00,
          encours_date: 1_704_067_200,
        },
      ],
      { asOfUnix: AS_OF }
    );

    expect(series![0].totalCentimes).toBe(180_000_00);
    expect(series![series!.length - 1].totalCentimes).toBe(180_000_00);
  });

  it("n'invente pas un point « aujourd'hui » si le montant n'a pas changé", () => {
    const lastKnown = toEvolutionDayTs(Date.UTC(2025, 2, 2) / 1000);
    const today = toEvolutionDayTs(Date.UTC(2026, 7, 13) / 1000);
    const series = buildPatrimoineEvolution(
      [
        {
          id: 1,
          encours_actuel: 12_672_00,
          encours_date: lastKnown,
          valorisations: [{ dateTs: lastKnown, montantCentimes: 12_672_00 }],
        },
      ],
      { asOfUnix: today }
    );

    expect(series).toBeNull();
  });

  it("ajoute le point courant seulement si l'encours a bougé sans nouvelle date", () => {
    const lastKnown = toEvolutionDayTs(Date.UTC(2025, 2, 2) / 1000);
    const today = toEvolutionDayTs(Date.UTC(2026, 7, 13) / 1000);
    const series = buildPatrimoineEvolution(
      [
        {
          id: 1,
          encours_actuel: 13_000_00,
          valorisations: [{ dateTs: lastKnown, montantCentimes: 12_672_00 }],
        },
      ],
      { asOfUnix: today }
    );

    expect(series?.map((p) => p.dateTs)).toEqual([lastKnown, today]);
    expect(series?.[0].totalCentimes).toBe(12_672_00);
    expect(series?.[1].totalCentimes).toBe(13_000_00);
  });

  it("distingue deux jours du même mois dans le libellé", () => {
    const a = toEvolutionDayTs(Date.UTC(2026, 7, 5) / 1000);
    const b = toEvolutionDayTs(Date.UTC(2026, 7, 11) / 1000);
    // toEvolutionDayTs uses local timezone — compare format difference via build
    const series = buildPatrimoineEvolution(
      [
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
      ],
      { asOfUnix: b }
    );

    const labels = series!.map((p) => p.label);
    const uniqueAugustish = new Set(labels.filter((l) => /2026/.test(l)));
    expect(uniqueAugustish.size).toBeGreaterThanOrEqual(1);
    expect(formatEvolutionLabel(a)).not.toBe(formatEvolutionLabel(1_577_836_800));
  });
});
