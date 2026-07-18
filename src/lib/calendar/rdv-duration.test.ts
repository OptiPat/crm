import { describe, expect, it } from "vitest";
import { defaultRdvDurationPresetForPlanOption } from "@/lib/calendar/rdv-duration";

describe("defaultRdvDurationPresetForPlanOption", () => {
  it("fixe 90 min pour R1, R2 Immo et R3 Immo", () => {
    expect(defaultRdvDurationPresetForPlanOption("R1")).toBe("90");
    expect(defaultRdvDurationPresetForPlanOption("R2_IMMO")).toBe("90");
    expect(defaultRdvDurationPresetForPlanOption("R3_IMMO")).toBe("90");
  });

  it("fixe 60 min pour R2 placements et R3 placements", () => {
    expect(defaultRdvDurationPresetForPlanOption("R2_PLACEMENT")).toBe("60");
    expect(defaultRdvDurationPresetForPlanOption("R3")).toBe("60");
    expect(defaultRdvDurationPresetForPlanOption("R3_PLACEMENT")).toBe("60");
  });
});
