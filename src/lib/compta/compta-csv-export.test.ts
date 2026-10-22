import { describe, expect, it } from "vitest";
import type { ComptaDepense } from "@/lib/api/tauri-compta";
import { buildComptaJournalCsv } from "./compta-csv-export";
import { formatComptaMoneyPdf } from "./compta-money";

describe("buildComptaJournalCsv", () => {
  it("sépare par « ; » et écrit les montants avec une virgule", () => {
    const depense = {
      date: "2026-10-03",
      categorie: "Repas",
      tiers: "Bistrot; du coin",
      ht: 1234.5,
      tva: 10,
      ttc: 1244.5,
      lienDrive: null,
    } as unknown as ComptaDepense;
    const csv = buildComptaJournalCsv({
      depenses: [depense],
      encaissements: [],
      deplacements: [],
    });
    const lines = csv.replace(/^﻿/, "").split("\r\n");
    expect(lines[0]).toBe("Date;Type;Libellé;HT;TVA;TTC;Don;Lien Drive");
    expect(lines[1]).toContain(';"Repas - Bistrot; du coin";1234,50;10,00;1244,50;;');
  });
});

describe("formatComptaMoneyPdf", () => {
  it("sépare les milliers par une espace normale", () => {
    expect(formatComptaMoneyPdf(12345)).toBe("12 345,00 €");
    expect(formatComptaMoneyPdf(1234567.891)).toBe("1 234 567,89 €");
    expect(formatComptaMoneyPdf(-1500.5)).toBe("-1 500,50 €");
    expect(formatComptaMoneyPdf(0)).toBe("0,00 €");
    expect(formatComptaMoneyPdf(999)).toBe("999,00 €");
  });
});
