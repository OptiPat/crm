import { describe, expect, it } from "vitest";
import {
  computeStelliumPerfPctFromStored,
  formatStelliumPerfPctLabel,
} from "./stellium-perf-display";

describe("stellium-perf-display", () => {
  it("calcule perf % = perf € / versements nets", () => {
    expect(computeStelliumPerfPctFromStored(50_000, 1_000_000)).toBeCloseTo(5, 5);
  });

  it("formate le pourcentage avec signe", () => {
    expect(formatStelliumPerfPctLabel(50_000, 1_000_000)).toBe("+5 %");
  });
});
