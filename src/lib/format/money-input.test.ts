import { describe, expect, it } from "vitest";
import { caretAfterDigits, digitsBefore, formatMoneyInput, parseMoneyInput } from "./money-input";

describe("saisie de montant", () => {
  it("affiche les milliers avec des espaces et la virgule décimale", () => {
    expect(formatMoneyInput("10000.5")).toBe("10 000,5");
    expect(formatMoneyInput("1234567")).toBe("1 234 567");
    expect(formatMoneyInput("10000,")).toBe("10 000,");
    expect(formatMoneyInput("")).toBe("");
    expect(formatMoneyInput("0.05")).toBe("0,05");
  });

  it("renvoie une valeur lisible par parseFloat", () => {
    expect(parseMoneyInput("10 000,50")).toBe("10000.50");
    expect(parseMoneyInput("10000.5")).toBe("10000.5");
    expect(parseMoneyInput("1 234")).toBe("1234");
    expect(parseMoneyInput("abc")).toBe("");
    expect(parseMoneyInput(",5")).toBe("0.5");
    expect(parseMoneyInput("12,345")).toBe("12.34");
    expect(parseMoneyInput("12.")).toBe("12.");
    expect(parseFloat(parseMoneyInput("10 000,50"))).toBe(10000.5);
  });

  it("reconnaît les séparateurs de milliers collés", () => {
    expect(parseMoneyInput("1.234.567")).toBe("1234567");
    expect(parseMoneyInput("1,234,567")).toBe("1234567");
    expect(parseMoneyInput("10.000")).toBe("10000");
    expect(parseMoneyInput("10.000,50")).toBe("10000.50");
    expect(parseMoneyInput("1,234.56")).toBe("1234.56");
    expect(parseMoneyInput("€ 2 500,00")).toBe("2500.00");
    expect(parseMoneyInput("12.50")).toBe("12.50");
  });

  it("ignore le signe moins (montants positifs)", () => {
    expect(parseMoneyInput("-500")).toBe("500");
  });

  it("replace le curseur après le même chiffre", () => {
    const typed = "10000";
    const formatted = formatMoneyInput(typed);
    expect(formatted).toBe("10 000");
    expect(caretAfterDigits(formatted, digitsBefore(typed, 5))).toBe(6);
    expect(caretAfterDigits(formatted, digitsBefore(typed, 2))).toBe(2);
  });
});
