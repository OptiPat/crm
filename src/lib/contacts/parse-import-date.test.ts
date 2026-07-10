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

  it("parse objet Date (serial Excel / cellDates) en jour calendaire local", () => {
    const iso = parseImportDate(new Date(Date.UTC(2024, 2, 27)));
    expect(iso).toBe("2024-03-27T00:00:00.000Z");
    const localMidnight = parseImportDate(new Date(2024, 10, 18));
    expect(isoToDateInput(localMidnight)).toBe("2024-11-18");
  });

  it("parse format JJ/MM/AA et JJ/MM/AAAA avec heure", () => {
    expect(parseImportDate("18/11/24")?.slice(0, 10)).toBe("2024-11-18");
    expect(parseImportDate("01/03/23")?.slice(0, 10)).toBe("2023-03-01");
    expect(parseImportDate("18/11/2024 00:00:00")?.slice(0, 10)).toBe("2024-11-18");
  });

  it("désambiguïse MM/JJ quand le second segment > 12", () => {
    expect(parseImportDate("11/18/2024")?.slice(0, 10)).toBe("2024-11-18");
    expect(parseImportDate("12/23/2024")?.slice(0, 10)).toBe("2024-12-23");
  });

  it("parse serial Excel 04/02/2021 sans décalage", () => {
    const iso = parseImportDate(44231);
    expect(iso?.slice(0, 10)).toBe("2021-02-04");
  });

  it("parse input date HTML YYYY-MM-DD en UTC calendaire", () => {
    expect(parseImportDate("2024-06-15")).toBe("2024-06-15T00:00:00.000Z");
  });

  it("parse format français 04/02/2021 sans décalage", () => {
    expect(parseImportDate("04/02/2021")?.slice(0, 10)).toBe("2021-02-04");
  });

  it("parse ISO datetime en jour calendaire UTC", () => {
    expect(parseImportDate("2024-11-18T00:00:00.000Z")).toBe("2024-11-18T00:00:00.000Z");
    expect(parseImportDate("2024-06-15T22:00:00.000Z")?.slice(0, 10)).toBe("2024-06-15");
  });
});

describe("isoToDateInput", () => {
  it("affiche la partie calendaire UTC", () => {
    expect(isoToDateInput("2024-06-15T00:00:00.000Z")).toBe("2024-06-15");
    expect(isoToDateInput("2021-02-04T00:00:00.000Z")).toBe("2021-02-04");
  });
});

describe("parseImportDateFinPret", () => {
  it("retourne ISO midi UTC", () => {
    expect(parseImportDateFinPret("05/12/2024")).toBe(
      "2024-12-05T12:00:00.000Z"
    );
  });
});
