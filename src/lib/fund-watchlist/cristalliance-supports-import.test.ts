import { describe, expect, it } from "vitest";
import {
  detectCristallianceAnnualYearColumns,
  detectCristallianceSupportsSheetLayout,
  isCristallianceFlatHeaderRow,
  pickCristallianceSupportsSheetName,
} from "./cristalliance-supports-layout";
import {
  excelSerialToUnixSeconds,
  normalizeCristalliancePerfPercent,
  parseCristallianceFeePercent,
  parseCristallianceSupportsSheetRows,
  summarizeCristallianceSupportsImport,
} from "./cristalliance-supports-import";

describe("detectCristallianceSupportsSheetLayout", () => {
  it("détecte les années annuelles et les colonnes volatilité / Sharpe", () => {
    const header: unknown[] = Array.from({ length: 65 }, () => "");
    header[15] = "Performances annuelles";
    header[22] = "Performances glissantes";
    header[30] = "Dernière VL 2025";
    header[33] = "Volatilités";
    header[36] = "Ratio de Sharpe";
    header[38] = "Frais de gestion";
    header[60] = "Classification SFDR";

    const subHeader: unknown[] = Array.from({ length: 65 }, () => "");
    subHeader[15] = "2019";
    subHeader[16] = "2020";
    subHeader[17] = "2021";
    subHeader[18] = "2022";
    subHeader[19] = "2023";
    subHeader[20] = "2024";
    subHeader[21] = "2025";
    subHeader[22] = "10 ans";
    subHeader[23] = "5 ans";
    subHeader[24] = "3 ans";
    subHeader[25] = "1 an";
    subHeader[26] = "Depuis début année";
    subHeader[27] = "3 mois";
    subHeader[28] = "1 mois";
    subHeader[29] = "1 semaine";
    subHeader[33] = "5 ans";
    subHeader[34] = "3 ans";
    subHeader[35] = "1 an";

    const layout = detectCristallianceSupportsSheetLayout(header, subHeader);
    expect(detectCristallianceAnnualYearColumns(subHeader).map((y) => y.year)).toEqual([
      "2019",
      "2020",
      "2021",
      "2022",
      "2023",
      "2024",
      "2025",
    ]);
    expect(layout.vol5ansIndex).toBe(33);
    expect(layout.vol3ansIndex).toBe(34);
    expect(layout.vol1anIndex).toBe(35);
    expect(layout.sharpeIndex).toBe(36);
    expect(layout.perf5ansIndex).toBe(23);
  });

  it("détecte le format plat (libellés complets, export Catalogue)", () => {
    const title = ["Cristalliance Avenir"];
    const labels: unknown[] = Array.from({ length: 65 }, () => "");
    labels[0] = "Code Isin";
    labels[1] = "Unité de compte";
    labels[15] = "Performances annuelles 2024";
    labels[16] = "Performances annuelles 2025";
    labels[23] = "Performances glissantes 5 ans";
    labels[24] = "Performances glissantes 3 ans";
    labels[25] = "Performances glissantes 1 an";
    labels[26] = "Performances glissantes Depuis début année";
    labels[27] = "Performances glissantes 3 mois";
    labels[28] = "Performances glissantes 1 mois";
    labels[29] = "Performances glissantes 1 semaine";
    labels[30] = "Dernière VL 2025";
    labels[31] = "Dernière VL 2026";
    labels[32] = "Date dernière VL 2026";
    labels[33] = "Volatilités 5 ans";
    labels[34] = "Volatilités 3 ans";
    labels[35] = "Volatilités 1 an";
    labels[36] = "Ratio de Sharpe";
    labels[38] = "Frais de gestion";
    labels[60] = "Classification SFDR";

    expect(isCristallianceFlatHeaderRow(title)).toBe(false);
    expect(isCristallianceFlatHeaderRow(labels)).toBe(true);

    const layout = detectCristallianceSupportsSheetLayout(title, labels);
    expect(layout.annualYearColumns.map((y) => y.year)).toEqual(["2024", "2025"]);
    expect(layout.perfYtdIndex).toBe(26);
    expect(layout.vlPreviousIndex).toBe(30);
    expect(layout.vlRecentIndex).toBe(31);
    expect(layout.vlDateIndex).toBe(32);
    expect(layout.vol3ansIndex).toBe(34);
    expect(layout.sharpeIndex).toBe(36);
    expect(layout.fraisGestionIndex).toBe(38);
    expect(layout.sfdrIndex).toBe(60);
  });

  it("s'adapte quand une nouvelle année remplace la plus ancienne", () => {
    const subHeader = ["", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "2020", "2021", "2022", "2023", "2024", "2025", "2026", "10 ans"];
    expect(detectCristallianceAnnualYearColumns(subHeader).map((y) => y.year)).toEqual([
      "2020",
      "2021",
      "2022",
      "2023",
      "2024",
      "2025",
      "2026",
    ]);
  });
});

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

  it("extrait VL, volatilités, Sharpe et performances annuelles", () => {
    const row: unknown[] = Array.from({ length: 65 }, () => "");
    row[0] = "FR0010135103";
    row[1] = "Fonds Test A";
    row[6] = "Actions Europe";
    row[7] = 4;
    row[8] = 5;
    row[15] = 0.2983;
    row[16] = 0.0661;
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
    row[33] = 0.1473;
    row[34] = 0.1247;
    row[35] = 0.1366;
    row[36] = 1.12;
    row[38] = 1.8;
    row[60] = "Article 8";

    const sub = Array.from({ length: 65 }, () => "");
    sub[15] = "2024";
    sub[16] = "2025";
    sub[23] = "5 ans";
    sub[24] = "3 ans";
    sub[25] = "1 an";
    sub[26] = "Depuis début année";
    sub[27] = "3 mois";
    sub[28] = "1 mois";
    sub[29] = "1 semaine";
    sub[33] = "5 ans";
    sub[34] = "3 ans";
    sub[35] = "1 an";

    const hdr = Array.from({ length: 65 }, () => "");
    hdr[22] = "Performances glissantes";
    hdr[30] = "Dernière VL 2025";
    hdr[33] = "Volatilités";
    hdr[36] = "Ratio de Sharpe";
    hdr[38] = "Frais de gestion";
    hdr[60] = "Classification SFDR";

    const [parsed] = parseCristallianceSupportsSheetRows([hdr, sub, row]);
    expect(parsed?.isin).toBe("FR0010135103");
    expect(parsed?.perf_ytd).toBeCloseTo(2.5, 4);
    expect(parsed?.vol_5ans).toBeCloseTo(14.73, 2);
    expect(parsed?.sharpe_ratio).toBeCloseTo(1.12, 2);
    expect(parsed?.perf_annual?.["2024"]).toBeCloseTo(29.83, 2);
    expect(parsed?.perf_annual?.["2025"]).toBeCloseTo(6.61, 2);
    expect(parsed?.vl_date).toBeTypeOf("number");
  });

  it("extrait perfs, VL, Sharpe et frais texte du format plat Catalogue", () => {
    const labels: unknown[] = Array.from({ length: 65 }, () => "");
    labels[0] = "Code Isin";
    labels[15] = "Performances annuelles 2024";
    labels[16] = "Performances annuelles 2025";
    labels[23] = "Performances glissantes 5 ans";
    labels[24] = "Performances glissantes 3 ans";
    labels[25] = "Performances glissantes 1 an";
    labels[26] = "Performances glissantes Depuis début année";
    labels[30] = "Dernière VL 2025";
    labels[31] = "Dernière VL 2026";
    labels[32] = "Date dernière VL 2026";
    labels[33] = "Volatilités 5 ans";
    labels[34] = "Volatilités 3 ans";
    labels[36] = "Ratio de Sharpe";
    labels[38] = "Frais de gestion";
    labels[60] = "Classification SFDR";

    const row: unknown[] = Array.from({ length: 65 }, () => "");
    row[0] = "FR0010135103";
    row[1] = "Fonds Test A";
    row[6] = "Actions Zone Euro Grandes Cap.";
    row[7] = "3";
    row[8] = "4";
    row[15] = 0.2983;
    row[16] = 0.0661;
    row[26] = 0.1208665;
    row[30] = 340.21;
    row[31] = 381.33;
    row[32] = 46269;
    row[33] = 0.1467;
    row[34] = 0.1237;
    row[36] = 1.17;
    row[38] = "1,6%";
    row[60] = "Article 8";

    const [parsed] = parseCristallianceSupportsSheetRows([
      ["Cristalliance Avenir"],
      labels,
      row,
    ]);
    expect(parsed?.categorie).toBe("Actions Zone Euro Grandes Cap.");
    expect(parsed?.sri).toBe(4);
    expect(parsed?.perf_ytd).toBeCloseTo(12.08665, 4);
    expect(parsed?.perf_annual?.["2024"]).toBeCloseTo(29.83, 2);
    expect(parsed?.vl_previous).toBeCloseTo(340.21, 2);
    expect(parsed?.vl_recent).toBeCloseTo(381.33, 2);
    expect(parsed?.vl_date).toBe((46269 - 25569) * 86_400);
    expect(parsed?.vol_3ans).toBeCloseTo(12.37, 2);
    expect(parsed?.sharpe_ratio).toBeCloseTo(1.17, 2);
    expect(parsed?.frais_gestion).toBeCloseTo(1.6, 4);
    expect(parsed?.sfdr).toBe("Article 8");
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
        vol_5ans: 12,
        vol_3ans: 11,
        vol_1an: 10,
        sharpe_ratio: 0.9,
        perf_annual: { "2024": 8, "2025": 9 },
        frais_gestion: null,
        sfdr: null,
      },
    ]);
    expect(summary).toEqual({
      total: 1,
      withVl: 1,
      withPerfYtd: 1,
      withSharpe: 1,
      annualYears: ["2025", "2024"],
    });
  });
});

describe("normalizeCristalliancePerfPercent", () => {
  it("convertit le décimal Cristalliance en points de pourcentage", () => {
    expect(normalizeCristalliancePerfPercent(0.0942566)).toBeCloseTo(9.42566, 4);
    expect(normalizeCristalliancePerfPercent(0.154838)).toBeCloseTo(15.4838, 4);
  });
});

describe("parseCristallianceFeePercent", () => {
  it("accepte le nombre historique et le texte pourcent", () => {
    expect(parseCristallianceFeePercent(1.8)).toBeCloseTo(1.8, 4);
    expect(parseCristallianceFeePercent("1,6%")).toBeCloseTo(1.6, 4);
    expect(parseCristallianceFeePercent("1,794%")).toBeCloseTo(1.794, 4);
    expect(parseCristallianceFeePercent("")).toBeNull();
  });
});

describe("pickCristallianceSupportsSheetName", () => {
  it("préfère Supports, puis Catalogue, sinon la première feuille", () => {
    expect(pickCristallianceSupportsSheetName(["Catalogue"])).toBe("Catalogue");
    expect(pickCristallianceSupportsSheetName(["Intro", "Supports"])).toBe("Supports");
    expect(pickCristallianceSupportsSheetName(["Feuil1"])).toBe("Feuil1");
  });
});

describe("excelSerialToUnixSeconds", () => {
  it("convertit une date Excel", () => {
    expect(excelSerialToUnixSeconds(46218)).toBe((46218 - 25569) * 86_400);
    expect(excelSerialToUnixSeconds("")).toBeNull();
  });
});
