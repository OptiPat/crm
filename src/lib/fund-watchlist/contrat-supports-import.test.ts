import { describe, expect, it } from "vitest";
import {
  parseContratSupportsCsv,
  parseContratSupportDate,
  parseContratSupportNumber,
  summarizeContratSupportsImport,
} from "./contrat-supports-import";

const HEADER =
  "Prestation;Numéro contrat;Civilité;Nom;Prénom;Support;Code ISIN;Société de gestion;Type;SRI;" +
  "Nombre de parts;Valeur unitaire en €;Encours en €;+/- value (en %));Date valeur;Date d'import;" +
  "Consultant;Email titulaire(s)";

function csv(...lines: string[]): string {
  return [HEADER, ...lines].join("\r\n");
}

describe("parseContratSupportsCsv", () => {
  it("lit une ligne de support et ignore les colonnes d'identité", () => {
    const rows = parseContratSupportsCsv(
      csv(
        "PLATEFORME VIE;2399922;M.;DUPONT;Jean;Fonds Test Or RC;FR0007390174;Gestion Test;Actions;6;" +
          "36,89120102;121,55;4485,00;12,34;04/08/2026;05/08/2026;Conseiller Test;j@example.com"
      )
    );

    expect(rows).toEqual([
      {
        numero_contrat: "2399922",
        isin: "FR0007390174",
        libelle: "Fonds Test Or RC",
        societe_gestion: "Gestion Test",
        type_support: "Actions",
        sri: 6,
        nb_parts: 36.89120102,
        valeur_unitaire: 121.55,
        encours: 4485,
        plus_moins_value_pct: 12.34,
        date_valeur: Date.UTC(2026, 7, 4) / 1000,
      },
    ]);
  });

  it("conserve les supports sans ISIN normé (fonds euro, structuré, FCPR)", () => {
    const rows = parseContratSupportsCsv(
      csv(
        "PLATEFORME VIE;2399922;M.;DUPONT;Jean;Support en euro;EURO0000TEST;Assureur Test;" +
          "Support en euro;1;1,324;1000,00;1324,00;0,00;04/08/2026;05/08/2026;Conseiller Test;j@example.com",
        "PLATEFORME VIE;2399922;M.;DUPONT;Jean;Produit Structuré Test;IGPS0000007D;Banque Test;" +
          "Structurés;4;10;98,50;985,00;-1,50;04/08/2026;05/08/2026;Conseiller Test;j@example.com"
      )
    );

    expect(rows.map((r) => r.isin)).toEqual(["EURO0000TEST", "IGPS0000007D"]);
    expect(rows[1]!.plus_moins_value_pct).toBe(-1.5);
  });

  it("ignore les lignes sans numéro de contrat, sans code ou sans libellé", () => {
    const rows = parseContratSupportsCsv(
      csv(
        ";;;;;Fonds Sans Contrat;FR0000000001;;;;;;;;;;;",
        "PLATEFORME VIE;2399922;M.;DUPONT;Jean;;FR0000000002;;;;;;;;;;;",
        "PLATEFORME VIE;2399922;M.;DUPONT;Jean;Fonds Sans Code;;;;;;;;;;;;"
      )
    );

    expect(rows).toEqual([]);
  });

  it("retourne une liste vide si l'en-tête ne correspond pas", () => {
    expect(parseContratSupportsCsv("colonne A;colonne B\n1;2")).toEqual([]);
  });
});

describe("parseContratSupportNumber", () => {
  it("lit les nombres français, espaces insécables et signes typographiques", () => {
    expect(parseContratSupportNumber("1 234,56")).toBe(1234.56);
    expect(parseContratSupportNumber("\u22123,5")).toBe(-3.5);
    expect(parseContratSupportNumber("Non disponible")).toBeNull();
    expect(parseContratSupportNumber("")).toBeNull();
  });
});

describe("parseContratSupportDate", () => {
  it("lit une date française et refuse le reste", () => {
    expect(parseContratSupportDate("04/08/2026")).toBe(Date.UTC(2026, 7, 4) / 1000);
    expect(parseContratSupportDate("2026-08-04")).toBeNull();
  });
});

describe("summarizeContratSupportsImport", () => {
  it("compte les contrats, les supports et l'encours", () => {
    const rows = parseContratSupportsCsv(
      csv(
        "PLATEFORME VIE;2399922;M.;DUPONT;Jean;Fonds A;FR0000000011;G;Actions;6;10;100,00;1000,00;5,00;04/08/2026;05/08/2026;C;j@example.com",
        "PLATEFORME VIE;2399922;M.;DUPONT;Jean;Fonds B;FR0000000022;G;Obligataire;3;10;50,00;500,00;1,00;04/08/2026;05/08/2026;C;j@example.com",
        "PLATEFORME VIE;2399923;Mme;LEGRAND;Marie;Fonds A;FR0000000011;G;Actions;6;20;100,00;2000,00;5,00;04/08/2026;05/08/2026;C;m@example.com"
      )
    );

    expect(summarizeContratSupportsImport(rows)).toEqual({
      lignes: 3,
      contrats: 2,
      supports: 2,
      encoursTotal: 3500,
      dateValeur: Date.UTC(2026, 7, 4) / 1000,
    });
  });
});
