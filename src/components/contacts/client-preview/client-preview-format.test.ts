import { describe, expect, it } from "vitest";
import {
  formatChartCenterTotal,
  formatClientPreviewTotal,
} from "./client-preview-format";

describe("formatChartCenterTotal", () => {
  it("compacte au million comme le hero", () => {
    expect(formatChartCenterTotal(1_500_000_00)).toBe(
      formatClientPreviewTotal(1_500_000_00)
    );
  });

  it("supprime les centimes au-delà de 100 k€ pour le centre donut", () => {
    expect(formatChartCenterTotal(66_319_860)).toMatch(/663\s199\s€/);
  });

  it("garde les centimes en dessous de 100 k€", () => {
    expect(formatChartCenterTotal(99_999_99)).toContain(",99");
  });
});
