import { describe, expect, it } from "vitest";
import {
  normalizeTmiRate,
  parseConditionIrNetConfig,
  parseConditionTmiConfig,
} from "@/lib/etiquettes/fiscal-tmi";

describe("normalizeTmiRate", () => {
  it("accepte les formats courants", () => {
    expect(normalizeTmiRate("11")).toBe(11);
    expect(normalizeTmiRate("11%")).toBe(11);
    expect(normalizeTmiRate("11 %")).toBe(11);
    expect(normalizeTmiRate("TMI 30")).toBe(30);
    expect(normalizeTmiRate(41)).toBe(41);
    expect(normalizeTmiRate("0")).toBe(0);
  });

  it("rejette vide ou hors liste", () => {
    expect(normalizeTmiRate("")).toBeNull();
    expect(normalizeTmiRate("-")).toBeNull();
    expect(normalizeTmiRate("12")).toBeNull();
    expect(normalizeTmiRate("11,5")).toBeNull();
  });
});

describe("parseConditionTmiConfig", () => {
  it("parse les tranches", () => {
    expect(parseConditionTmiConfig('{"tranches":[11,"30 %",99]}')).toEqual({
      tranches: [11, 30],
    });
  });
});

describe("parseConditionIrNetConfig", () => {
  it("parse montant et opérateur", () => {
    expect(parseConditionIrNetConfig('{"operator":"gte","montant":4000}')).toEqual({
      operator: "gte",
      montant: 4000,
    });
  });
});
