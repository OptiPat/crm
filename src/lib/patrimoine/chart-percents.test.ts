import { describe, expect, it } from "vitest";
import { distributeIntegerPercents } from "./chart-percents";

describe("distributeIntegerPercents", () => {
  it("totalise toujours 100 %", () => {
    const percents = distributeIntegerPercents([
      605_820_00, 38_286_00, 19_092_60, 20_000_00,
    ]);
    expect(percents.reduce((sum, value) => sum + value, 0)).toBe(100);
    expect(percents.every((value) => value >= 0)).toBe(true);
  });

  it("gère une seule tranche", () => {
    expect(distributeIntegerPercents([100_000_00])).toEqual([100]);
  });
});
