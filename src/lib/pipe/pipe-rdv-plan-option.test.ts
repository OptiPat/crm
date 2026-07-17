import { describe, expect, it } from "vitest";
import {
  defaultPlanOptionForRdvStage,
  isGenericR2EntryTitre,
  isGenericR3EntryTitre,
  isTypifiableR2Entry,
  isTypifiableR3Entry,
  planOptionsForRdvStage,
  rdvEntryTitreFromPlanOption,
  rdvPlanOptionFromEntryTitre,
  rdvStageFromPlanOption,
  stageHasPlanVariants,
} from "@/lib/pipe/pipe-rdv-plan-option";

describe("pipe-rdv-plan-option", () => {
  it("convertit option → étape funnel", () => {
    expect(rdvStageFromPlanOption("R1")).toBe("R1");
    expect(rdvStageFromPlanOption("R2")).toBe("R2");
    expect(rdvStageFromPlanOption("R2_PLACEMENT")).toBe("R2");
    expect(rdvStageFromPlanOption("R2_IMMO")).toBe("R2");
    expect(rdvStageFromPlanOption("R3")).toBe("R3");
    expect(rdvStageFromPlanOption("R3_PLACEMENT")).toBe("R3");
    expect(rdvStageFromPlanOption("R3_IMMO")).toBe("R3");
  });

  it("produit le titre timeline attendu", () => {
    expect(rdvEntryTitreFromPlanOption("R2")).toBe("R2");
    expect(rdvEntryTitreFromPlanOption("R2_PLACEMENT")).toBe("R2 Placement");
    expect(rdvEntryTitreFromPlanOption("R2_IMMO")).toBe("R2 Immo");
    expect(rdvEntryTitreFromPlanOption("R3_PLACEMENT")).toBe("R3 Placements");
    expect(rdvEntryTitreFromPlanOption("R3_IMMO")).toBe("R3 Immo");
  });

  it("lit l'option depuis le titre timeline", () => {
    expect(rdvPlanOptionFromEntryTitre("R2 Placement")).toBe("R2_PLACEMENT");
    expect(rdvPlanOptionFromEntryTitre("R2 Immo")).toBe("R2_IMMO");
    expect(rdvPlanOptionFromEntryTitre("R3 Placements")).toBe("R3_PLACEMENT");
    expect(rdvPlanOptionFromEntryTitre("R3 Immo")).toBe("R3_IMMO");
    expect(rdvPlanOptionFromEntryTitre("R2")).toBe("R2");
    expect(rdvPlanOptionFromEntryTitre("Appel")).toBeNull();
  });

  it("détecte un R2/R3 générique typifiable", () => {
    expect(isGenericR2EntryTitre("R2")).toBe(true);
    expect(isGenericR3EntryTitre("R3")).toBe(true);
    expect(
      isTypifiableR2Entry({ entry_type: "RDV", titre: "R2" })
    ).toBe(true);
    expect(
      isTypifiableR3Entry({ entry_type: "RDV", titre: "R3" })
    ).toBe(true);
  });

  it("propose des variantes pour R2 et R3", () => {
    expect(stageHasPlanVariants("R2")).toBe(true);
    expect(stageHasPlanVariants("R3")).toBe(true);
    expect(stageHasPlanVariants("R1")).toBe(false);
    expect(planOptionsForRdvStage("R2")).toHaveLength(3);
    expect(planOptionsForRdvStage("R3")).toHaveLength(3);
  });

  it("défaut plan option depuis étape", () => {
    expect(defaultPlanOptionForRdvStage("R2")).toBe("R2");
    expect(defaultPlanOptionForRdvStage("R3")).toBe("R3");
  });
});
