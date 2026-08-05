import { describe, expect, it } from "vitest";
import { computeJdFunnelProgressPercent } from "./organisation-jd-funnel-tracker";

describe("organisation-jd-funnel-tracker", () => {
  it("calcule la progression, sans la plafonner à 100 % (dépassement visible)", () => {
    expect(computeJdFunnelProgressPercent(32, 64)).toBe(50);
    expect(computeJdFunnelProgressPercent(80, 64)).toBe(125);
    expect(computeJdFunnelProgressPercent(0, 64)).toBe(0);
    expect(computeJdFunnelProgressPercent(10, null)).toBeNull();
    expect(computeJdFunnelProgressPercent(10, 0)).toBeNull();
  });
});
