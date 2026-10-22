import { describe, expect, it } from "vitest";
import { normalizeImportAmount } from "./import-amount";

const euros = (raw: unknown) => parseFloat(normalizeImportAmount(raw));

describe("montants importés", () => {
  it("lit les formats français et anglais", () => {
    expect(euros("10 000,50")).toBe(10000.5);
    expect(euros("10.000,50")).toBe(10000.5);
    expect(euros("1,234.56")).toBe(1234.56);
    expect(euros("1 234 €")).toBe(1234);
    expect(euros("1.234.567")).toBe(1234567);
    expect(euros("12,5")).toBe(12.5);
    expect(euros("12.5")).toBe(12.5);
    expect(euros(10000.5)).toBe(10000.5);
  });

  it("garde le signe et rejette le vide", () => {
    expect(euros("-500")).toBe(-500);
    expect(euros("(500)")).toBe(-500);
    expect(Number.isNaN(euros(""))).toBe(true);
    expect(Number.isNaN(euros("abc"))).toBe(true);
  });
});
