import { describe, expect, it } from "vitest";
import {
  ORGANISATION_MANAGER_VOLUME_TARGET,
  getManagerObjectiveStatus,
  hasManagerRankBadge,
  isManagerObjectiveEligible,
} from "./organisation-manager-objective";

describe("organisation-manager-objective", () => {
  it("hasManagerRankBadge — titre Manager+ ou qualification Manager", () => {
    expect(hasManagerRankBadge("MANAGER", null)).toBe(true);
    expect(hasManagerRankBadge("SENIOR", null)).toBe(true);
    expect(hasManagerRankBadge("CONSULTANT", "MANAGER")).toBe(true);
    expect(hasManagerRankBadge("JUNIOR", null)).toBe(false);
    expect(hasManagerRankBadge("CONSULTANT", "PLANETE")).toBe(false);
  });

  it("isManagerObjectiveEligible — Junior / Consultant sans badge Manager", () => {
    expect(isManagerObjectiveEligible(undefined)).toBe(true);
    expect(isManagerObjectiveEligible("JUNIOR")).toBe(true);
    expect(isManagerObjectiveEligible("CONSULTANT")).toBe(true);
    expect(isManagerObjectiveEligible("MANAGER")).toBe(false);
    expect(isManagerObjectiveEligible("CONSULTANT", "MANAGER")).toBe(false);
  });

  it("getManagerObjectiveStatus — 500 k€ cumul, sans limite de temps", () => {
    expect(getManagerObjectiveStatus(500_000, true)).toBe("target_met");
    expect(getManagerObjectiveStatus(499_999, true)).toBe("below_target");
    expect(getManagerObjectiveStatus(600_000, false)).toBe("not_applicable");
    expect(ORGANISATION_MANAGER_VOLUME_TARGET).toBe(500_000);
  });
});
