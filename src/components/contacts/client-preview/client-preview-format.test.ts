import { describe, expect, it } from "vitest";
import {
  formatChartCenterTotal,
  formatClientPreviewEuro,
  formatClientPreviewTotal,
  formatShortEuro,
} from "./client-preview-format";

describe("formatClientPreviewEuro", () => {
  it("arrondit à l'euro sans décimales", () => {
    expect(formatClientPreviewEuro(68_319_860)).toMatch(/683\s199\s€/);
    expect(formatClientPreviewEuro(99_999_99)).toMatch(/100\s000\s€/);
  });
});

describe("formatClientPreviewTotal", () => {
  it("compacte au million", () => {
    expect(formatClientPreviewTotal(1_500_000_00)).toBe("1,5 M€");
  });
});

describe("formatChartCenterTotal", () => {
  it("aligne le hero, le donut et les lignes", () => {
    expect(formatChartCenterTotal(68_319_860)).toBe(
      formatClientPreviewTotal(68_319_860)
    );
    expect(formatChartCenterTotal(68_319_860)).toBe(formatShortEuro(68_319_860));
  });
});
