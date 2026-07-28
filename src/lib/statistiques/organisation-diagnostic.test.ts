import { describe, expect, it } from "vitest";
import { defaultStatistiquesBenchmarkSettings } from "./statistiques-benchmark-settings";
import {
  computeOrganisationDiagnostic,
  sortOrganisationDiagnosticBySeverity,
  type OrganisationDiagnosticInput,
} from "./organisation-diagnostic";

function baseInput(overrides: Partial<OrganisationDiagnosticInput> = {}): OrganisationDiagnosticInput {
  return {
    benchmarkSettings: defaultStatistiquesBenchmarkSettings(),
    ...overrides,
  };
}

describe("computeOrganisationDiagnostic", () => {
  it("ignore les règles sans valeur fournie", () => {
    const entries = computeOrganisationDiagnostic(baseInput());
    expect(entries).toEqual([]);
  });

  it("marque le volume ok au-dessus de la référence groupe", () => {
    const entries = computeOrganisationDiagnostic(baseInput({ averageVolume: 600_000 }));
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ ruleId: "volume", severity: "ok" });
  });

  it("marque le volume en alerte nettement sous la référence groupe", () => {
    const entries = computeOrganisationDiagnostic(baseInput({ averageVolume: 300_000 }));
    expect(entries[0]).toMatchObject({ ruleId: "volume", severity: "alert" });
  });

  it("marque le volume en watch dans la zone proche (80-100 %)", () => {
    const entries = computeOrganisationDiagnostic(baseInput({ averageVolume: 500_000 }));
    expect(entries[0]).toMatchObject({ ruleId: "volume", severity: "watch" });
  });

  it("détecte une croissance nette critique après 2 exercices rouges consécutifs", () => {
    const entries = computeOrganisationDiagnostic(
      baseInput({ netGrowthPercent: -20, previousNetGrowthPercent: -10 })
    );
    expect(entries[0]).toMatchObject({ ruleId: "croissanceNette", severity: "critical" });
  });

  it("ne marque pas critique une croissance rouge isolée (exercice précédent bon)", () => {
    const entries = computeOrganisationDiagnostic(
      baseInput({ netGrowthPercent: -20, previousNetGrowthPercent: 50 })
    );
    expect(entries[0]).toMatchObject({ ruleId: "croissanceNette", severity: "alert" });
  });

  it("utilise la référence par défaut 20 % pour le taux de Managers", () => {
    const entries = computeOrganisationDiagnostic(baseInput({ managerRatePercent: 8 }));
    expect(entries[0]).toMatchObject({ ruleId: "tauxManagers", severity: "alert" });
  });

  it("accepte une référence Manager personnalisée", () => {
    const entries = computeOrganisationDiagnostic(
      baseInput({ managerRatePercent: 25, groupManagerRatePercent: 20 })
    );
    expect(entries[0]).toMatchObject({ ruleId: "tauxManagers", severity: "ok" });
  });

  it("classe l'attrition ok / watch / alert selon les seuils heuristiques", () => {
    expect(
      computeOrganisationDiagnostic(baseInput({ attritionPercent: 20 }))[0].severity
    ).toBe("ok");
    expect(
      computeOrganisationDiagnostic(baseInput({ attritionPercent: 40 }))[0].severity
    ).toBe("watch");
    expect(
      computeOrganisationDiagnostic(baseInput({ attritionPercent: 60 }))[0].severity
    ).toBe("alert");
  });

  it("détecte une attrition critique après 2 exercices > 50 % consécutifs", () => {
    const entries = computeOrganisationDiagnostic(
      baseInput({ attritionPercent: 55, previousAttritionPercent: 60 })
    );
    expect(entries[0]).toMatchObject({ ruleId: "attrition", severity: "critical" });
  });

  it("signale une forte variabilité du délai avant 1er parrainage", () => {
    const entries = computeOrganisationDiagnostic(
      baseInput({
        parrainageDurationMonths: 5,
        parrainageDurationHistoryMonths: [1, 0.5, 4],
      })
    );
    expect(entries[0]).toMatchObject({ ruleId: "delaiParrainage", severity: "watch" });
  });

  it("ne signale pas de problème si le délai 1er parrainage est stable", () => {
    const entries = computeOrganisationDiagnostic(
      baseInput({
        parrainageDurationMonths: 3,
        parrainageDurationHistoryMonths: [2.8, 3.2, 3],
      })
    );
    expect(entries[0]).toMatchObject({ ruleId: "delaiParrainage", severity: "ok" });
  });

  it("calcule les 10 règles simultanément quand toutes les valeurs sont fournies", () => {
    const entries = computeOrganisationDiagnostic(
      baseInput({
        averageVolume: 300_000,
        activeRatePercent: 40,
        sponsorRatePercent: 10,
        parrainagesPerParraineur: 2,
        netGrowthPercent: -30,
        vaaDurationMonths: 5,
        habilitationDurationMonths: 11,
        managerRatePercent: 8,
        attritionPercent: 55,
        parrainageDurationMonths: 3,
      })
    );
    expect(entries).toHaveLength(10);
  });
});

describe("sortOrganisationDiagnosticBySeverity", () => {
  it("place les critiques en premier et les ok en dernier", () => {
    const entries = computeOrganisationDiagnostic(
      baseInput({
        averageVolume: 600_000, // ok
        attritionPercent: 55,
        previousAttritionPercent: 60, // critical
        habilitationDurationMonths: 11, // alert
      })
    );
    const sorted = sortOrganisationDiagnosticBySeverity(entries);
    expect(sorted.map((e) => e.severity)).toEqual(["critical", "alert", "ok"]);
  });
});
