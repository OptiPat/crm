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
  /**
   * « 1 M€ » pour 1 004 299 € laissait croire à un chiffre rond que la somme
   * des lignes affichées démentait.
   */
  it("donne le montant exact au-delà du million", () => {
    expect(formatClientPreviewTotal(1_004_299_00)).toMatch(/1\s004\s299\s€/);
    expect(formatClientPreviewTotal(1_500_000_00)).toMatch(/1\s500\s000\s€/);
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
