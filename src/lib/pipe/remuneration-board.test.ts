import { describe, expect, it } from "vitest";
import {
  REMUNERATION_ALL_EXERCICES,
  defaultRemunerationExercice,
  groupRemunerationRowsByAffaire,
  remunerationCalcDetail,
  remunerationExerciceOptions,
} from "@/lib/pipe/remuneration-board";

describe("tableau de rémunération", () => {
  it("détaille le calcul SCPI (frais déduits) et AV", () => {
    expect(
      remunerationCalcDetail({
        montantCentimes: 5_000_000,
        typeProduit: "SCPI",
        productLabel: "Comète",
        cifEnabled: true,
        tpcPercent: 7,
      })
    ).toBe("(50 000 € − 10 %) × 0,5 × 7 %");
    expect(
      remunerationCalcDetail({
        montantCentimes: 7_000_000,
        typeProduit: "ASSURANCE_VIE",
        cifEnabled: false,
        tpcPercent: 6.5,
      })
    ).toBe("70 000 € × 0,4 × 6,5 %");
    expect(
      remunerationCalcDetail({
        montantCentimes: 7_000_000,
        typeProduit: "ASSURANCE_VIE",
        cifEnabled: false,
        tpcPercent: null,
      })
    ).toBeNull();
  });

  it("regroupe par affaire dans l'ordre d'apparition", () => {
    const groups = groupRemunerationRowsByAffaire([
      { pipeId: 2, id: "a" },
      { pipeId: 1, id: "b" },
      { pipeId: 2, id: "c" },
    ]);
    expect(groups.map((g) => [g.pipeId, g.rows.map((r) => r.id)])).toEqual([
      [2, ["a", "c"]],
      [1, ["b"]],
    ]);
  });

  it("exercices du plus récent au plus ancien, défaut = exercice en cours sinon le plus récent", () => {
    const options = remunerationExerciceOptions(["2024-2025", "2025-2026", "2024-2025"]);
    expect(options).toEqual(["2025-2026", "2024-2025"]);
    expect(defaultRemunerationExercice(options, "2024-2025")).toBe("2024-2025");
    expect(defaultRemunerationExercice(options, "2026-2027")).toBe("2025-2026");
    expect(defaultRemunerationExercice([], "2026-2027")).toBe(REMUNERATION_ALL_EXERCICES);
  });
});
