import { describe, expect, it } from "vitest";
import {
  getRapportMissionAnalyseExamples,
  RM_ANALYSE_SITUATION_EXAMPLES_CAPITAL_INVEST,
  RM_ANALYSE_SITUATION_EXAMPLES_SCPI,
} from "@/lib/souscription-cif/rapport-mission-analyse-hints";

describe("rapport-mission-analyse-hints", () => {
  it("retourne les exemples SCPI par défaut", () => {
    expect(getRapportMissionAnalyseExamples("scpi")).toBe(RM_ANALYSE_SITUATION_EXAMPLES_SCPI);
    expect(getRapportMissionAnalyseExamples("g3f")).toBe(RM_ANALYSE_SITUATION_EXAMPLES_SCPI);
  });

  it("retourne les exemples Capital investissement", () => {
    expect(getRapportMissionAnalyseExamples("capital-investissement")).toBe(
      RM_ANALYSE_SITUATION_EXAMPLES_CAPITAL_INVEST
    );
    expect(getRapportMissionAnalyseExamples("capital-investissement")[0]).toContain(
      "Optimiser la fiscalité de vos revenus"
    );
    expect(getRapportMissionAnalyseExamples("capital-investissement")).toHaveLength(4);
    expect(getRapportMissionAnalyseExamples("capital-investissement")[3]).toContain(
      "régulièrement depuis 5 ans"
    );
  });
});
