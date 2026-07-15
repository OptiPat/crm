import { describe, expect, it } from "vitest";
import {
  currentFiscalYearLabel,
  fiscalYearLabelForDate,
  fiscalYearLabelForUnix,
} from "@/lib/pipe/remuneration-fiscal-year";

describe("remuneration-fiscal-year", () => {
  it("année fiscale : août appartient à la nouvelle année", () => {
    expect(fiscalYearLabelForDate(new Date(2025, 7, 15))).toBe("2025-2026");
    expect(fiscalYearLabelForDate(new Date(2026, 6, 31))).toBe("2025-2026");
    expect(fiscalYearLabelForDate(new Date(2026, 7, 1))).toBe("2026-2027");
  });

  it("convertit un timestamp unix", () => {
    const ts = Math.floor(new Date(2025, 8, 1).getTime() / 1000);
    expect(fiscalYearLabelForUnix(ts)).toBe("2025-2026");
  });

  it("année courante cohérente", () => {
    expect(currentFiscalYearLabel(new Date(2026, 5, 1))).toBe("2025-2026");
  });
});
