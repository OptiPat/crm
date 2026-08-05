import { describe, expect, it } from "vitest";
import { mergeOrganisationObjectifTablePrefs } from "@/lib/statistiques/organisation-objectif-plan-storage";

describe("organisation objectif plan (manuel)", () => {
  it("mergeOrganisationObjectifTablePrefs retire une clé avec undefined", () => {
    expect(
      mergeOrganisationObjectifTablePrefs(
        { targetGrowthPercent: 50, attritionPercent: 20 },
        { targetGrowthPercent: undefined }
      )
    ).toEqual({ attritionPercent: 20 });
  });
});
