import { describe, expect, it } from "vitest";
import {
  parseImportDate,
  parseImportDateFinPret,
  isoToDateInput,
} from "./parse-import-date";

describe("parseImportDate", () => {
  it("parse format français JJ/MM/AAAA", () => {
    const iso = parseImportDate("05/12/2024");
    expect(iso).toBeDefined();
    expect(iso!.startsWith("2024-12-05")).toBe(true);
  });

  it("parse serial Excel", () => {
    const iso = parseImportDate("45630");
    expect(iso).toBeDefined();
    const year = new Date(iso!).getUTCFullYear();
    expect(year).toBeGreaterThan(2020);
    expect(year).toBeLessThan(2030);
  });

  it("retourne undefined si vide", () => {
    expect(parseImportDate("")).toBeUndefined();
    expect(parseImportDate(null)).toBeUndefined();
  });

  it("parse objet Date (cellDates Excel) sans décalage calendaire", () => {
    const iso = parseImportDate(new Date(2024, 2, 27));
    expect(iso!.startsWith("2024-03-27")).toBe(true);
  });

  it("parse input date HTML YYYY-MM-DD en UTC calendaire", () => {
    expect(parseImportDate("2024-06-15")).toBe("2024-06-15T00:00:00.000Z");
  });
});

describe("isoToDateInput", () => {
  it("affiche la partie calendaire UTC", () => {
    expect(isoToDateInput("2024-06-15T00:00:00.000Z")).toBe("2024-06-15");
    expect(isoToDateInput("2024-06-14T22:00:00.000Z")).toBe("2024-06-14");
  });
});

describe("parseImportDateFinPret", () => {
  it("retourne ISO midi UTC", () => {
    expect(parseImportDateFinPret("05/12/2024")).toBe(
      "2024-12-05T12:00:00.000Z"
    );
  });
});
