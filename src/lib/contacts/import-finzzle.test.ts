import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { FINZZLE_SAMPLE_CSV } from "./__fixtures__/import-finzzle-fixture";
import { unwrapImportCell } from "./import-row";
import { parseImportDate } from "./parse-import-date";
import {
  normalizeImportCivilite,
  normalizeImportStatut,
  normalizeImportTmi,
} from "./contact-form-utils";

/**
 * Vérifie le chemin de lecture CSV du modèle Finzzle (lecture brute + nettoyage +
 * parsing date), qui corrige l'inversion jour/mois faite par SheetJS sur les CSV texte.
 */
describe("import Finzzle (CSV brut)", () => {
  const readRows = (opts?: XLSX.ParsingOptions) => {
    const wb = XLSX.read(FINZZLE_SAMPLE_CSV, { type: "string", ...opts });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
  };

  it("préserve les dates JJ/MM/AAAA avec jour <= 12 (pas d'inversion US)", () => {
    const rows = readRows({ raw: true });
    const marie = rows.find((r) => r["Nom"] === "DUPONT");
    const iso = parseImportDate(marie!["Date de naissance"]);
    const d = new Date(iso!);
    // 05/03/1985 = 5 mars 1985, surtout pas 3 mai
    expect(d.getUTCDate()).toBe(5);
    expect(d.getUTCMonth()).toBe(2); // mars (0-indexé)
    expect(d.getUTCFullYear()).toBe(1985);
  });

  it("démontre le bug évité : sans mode brut, la date est réinterprétée (mois US)", () => {
    const rows = readRows(); // défaut, sans raw
    const marie = rows.find((r) => r["Nom"] === "DUPONT");
    const v = marie!["Date de naissance"];
    // SheetJS convertit en nombre (serial) au lieu de garder « 05/03/1985 »
    expect(typeof v).toBe("number");
  });

  it("nettoie le wrapper texte du téléphone (=\"+33...\")", () => {
    const rows = readRows({ raw: true });
    const marie = rows.find((r) => r["Nom"] === "DUPONT");
    expect(unwrapImportCell(marie!["Téléphone"])).toBe("+33600000001");
  });

  it("mappe la colonne Statut vers les catégories CRM", () => {
    const rows = readRows({ raw: true });
    const byName = (nom: string) => rows.find((r) => r["Nom"] === nom)!;
    expect(normalizeImportStatut(byName("DUPONT")["Statut"])).toBe("CLIENT");
    expect(normalizeImportStatut(byName("BERNARD")["Statut"])).toBe("PROSPECT_CLIENT");
    expect(normalizeImportStatut(byName("LEGRAND")["Statut"])).toBe("SUSPECT_CLIENT");
  });

  it("récupère civilité (Madame/Monsieur) et pays", () => {
    const rows = readRows({ raw: true });
    const byName = (nom: string) => rows.find((r) => r["Nom"] === nom)!;
    expect(normalizeImportCivilite(byName("DUPONT")["Civilité"])).toBe("MME");
    expect(normalizeImportCivilite(byName("BERNARD")["Civilité"])).toBe("M");
    expect(byName("DUPONT")["Pays"]).toBe("France");
  });

  it("normalise la TMI (« 11 » → « 11 % », « - » → vide)", () => {
    const rows = readRows({ raw: true });
    const byName = (nom: string) => rows.find((r) => r["Nom"] === nom)!;
    expect(normalizeImportTmi(byName("DUPONT")["TMI"])).toBe("11 %");
    expect(normalizeImportTmi(byName("LEGRAND")["TMI"])).toBeUndefined();
  });
});
