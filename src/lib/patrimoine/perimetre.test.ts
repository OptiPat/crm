import { describe, expect, it } from "vitest";
import { buildPerimetrePatrimoine, formatPerimetreSliceLine } from "./perimetre";

describe("buildPerimetrePatrimoine", () => {
  it("décompose par source sans total opaque", () => {
    const result = buildPerimetrePatrimoine([
      {
        origine: "MON_CONSEIL",
        encours_actuel: 52_000_000,
        encours_date: 1_710_000_000,
      },
      {
        origine: "DECLARE_CLIENT",
        montant_initial: 32_700_000,
        derniere_maj_client: 1_705_000_000,
      },
    ]);

    expect(result.totalCentimes).toBe(84_700_000);
    expect(result.slices).toHaveLength(2);
    expect(result.slices[0].origine).toBe("MON_CONSEIL");
    expect(result.slices[1].origine).toBe("DECLARE_CLIENT");
    expect(result.partDeclaree).toBeCloseTo(32_700_000 / 84_700_000);
  });

  it("utilise la date du dernier contact pour EXISTANT_CLIENT", () => {
    const result = buildPerimetrePatrimoine(
      [
        {
          origine: "EXISTANT_CLIENT",
          montant_initial: 300_000_00,
          encours_date: 1_606_358_400,
        },
      ],
      { dateDernierContact: 1_735_689_600 }
    );

    expect(result.slices).toHaveLength(1);
    expect(result.slices[0].origine).toBe("EXISTANT_CLIENT");
    expect(result.slices[0].referenceDate).toBe(1_735_689_600);
    expect(result.slices[0].label).toBe("Détenu ailleurs");
  });

  it("formate une ligne avec date", () => {
    const line = formatPerimetreSliceLine({
      origine: "MON_CONSEIL",
      centimes: 520_000_00,
      referenceDate: 1_710_000_000,
      label: "Investis avec votre conseiller",
    });
    expect(line).toMatch(/520[\s\u202f]?000 €/);
    expect(line).toContain("investis avec votre conseiller");
  });
});
