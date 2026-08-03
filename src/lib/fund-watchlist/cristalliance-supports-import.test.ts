import { describe, expect, it } from "vitest";
import {
  excelSerialToUnixSeconds,
  normalizeCristalliancePerfPercent,
  parseCristallianceSupportsSheetRows,
  summarizeCristallianceSupportsImport,
} from "./cristalliance-supports-import";

describe("parseCristallianceSupportsSheetRows", () => {
  const header = ["Code ISIN", "Unité de compte"];
  const subHeader = ["", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "2019"];

  it("ignore en-têtes et ne garde que les ISIN valides", () => {
    const rows = [
      header,
      subHeader,
      ["FR0010135103", "Fonds Test A"],
      ["INVALID", "Sans ISIN"],
      ["", ""],
      ["LU0336083810", "Carmignac Portfolio"],
    ];
    const parsed = parseCristallianceSupportsSheetRows(rows);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]?.isin).toBe("FR0010135103");
    expect(parsed[1]?.nom).toContain("Carmignac");
  });

  it("extrait VL, SRI et performances glissantes", () => {
    const row: unknown[] = Array.from({ length: 65 }, () => "");
    row[0] = "FR0010135103";
    row[1] = "Fonds Test A";
    row[6] = "Actions Europe";
    row[7] = 4;
    row[8] = 5;
    row[23] = 0.221;
    row[24] = 0.152;
    row[25] = 0.083;
    row[26] = 0.025;
    row[27] = 0.011;
    row[28] = 0.006;
    row[29] = -0.003;
    row[30] = 100.74;
    row[31] = 102.5;
    row[32] = 46218;
    row[38] = 1.8;
    row[60] = "Article 8";

    const [parsed] = parseCristallianceSupportsSheetRows([header, subHeader, row]);
    expect(parsed?.isin).toBe("FR0010135103");
    expect(parsed?.perf_ytd).toBeCloseTo(2.5, 4);
    expect(parsed?.perf_1semaine).toBeCloseTo(-0.3, 4);
    expect(parsed?.perf_1mois).toBeCloseTo(0.6, 4);
    expect(parsed?.perf_3mois).toBeCloseTo(1.1, 4);
    expect(parsed?.perf_1an).toBeCloseTo(8.3, 4);
    expect(parsed?.perf_3ans).toBeCloseTo(15.2, 4);
    expect(parsed?.perf_5ans).toBeCloseTo(22.1, 4);
    expect(parsed?.vl_date).toBeTypeOf("number");
  });

  it("résume le lot importé", () => {
    const summary = summarizeCristallianceSupportsImport([
      {
        isin: "FR0010135103",
        nom: "A",
        categorie: null,
        notation_morningstar: null,
        sri: null,
        vl_previous: null,
        vl_recent: 100,
        vl_date: null,
        perf_ytd: 1,
        perf_1semaine: null,
        perf_1mois: null,
        perf_3mois: null,
        perf_1an: null,
        perf_3ans: null,
        perf_5ans: null,
        frais_gestion: null,
        sfdr: null,
      },
    ]);
    expect(summary).toEqual({ total: 1, withVl: 1, withPerfYtd: 1 });
  });
});

describe("normalizeCristalliancePerfPercent", () => {
  it("convertit le décimal Cristalliance en points de pourcentage", () => {
    expect(normalizeCristalliancePerfPercent(0.0942566)).toBeCloseTo(9.42566, 4);
    expect(normalizeCristalliancePerfPercent(0.154838)).toBeCloseTo(15.4838, 4);
  });
});

describe("excelSerialToUnixSeconds", () => {
  it("convertit une date Excel", () => {
    expect(excelSerialToUnixSeconds(46218)).toBe((46218 - 25569) * 86_400);
    expect(excelSerialToUnixSeconds("")).toBeNull();
  });
});
