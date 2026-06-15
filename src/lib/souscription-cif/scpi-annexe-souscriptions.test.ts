import { describe, expect, it } from "vitest";
import {
  buildMesPreconisationsFromSouscriptions,
  buildOptionsComplementFromSouscriptions,
  defaultScpiAnnexeSouscriptions,
  normalizeScpiAnnexeSouscriptions,
  shouldAutoSyncMesPreconisationsText,
  sumMontantSouscritFromSouscriptions,
  upsertScpiAnnexeSouscription,
} from "@/lib/souscription-cif/scpi-annexe-souscriptions";

const cometeRow = {
  productKey: "comete",
  montantSouscritEur: "30000",
  partPriceEur: "250",
  reinvestissementDividendesPct: "100",
  vpMontantEur: "50",
  vpFrequence: "mois" as const,
};

describe("sumMontantSouscritFromSouscriptions", () => {
  it("additionne les montants des lignes", () => {
    expect(
      sumMontantSouscritFromSouscriptions([
        { ...cometeRow, montantSouscritEur: "20000" },
        {
          productKey: "corum_origin",
          montantSouscritEur: "10 000",
          partPriceEur: "1135",
          reinvestissementDividendesPct: "",
          vpMontantEur: "",
          vpFrequence: "mois",
        },
      ])
    ).toBe(30_000);
  });
});

describe("buildOptionsComplementFromSouscriptions", () => {
  it("formate réinvestissement et VP pour une SCPI", () => {
    expect(buildOptionsComplementFromSouscriptions([cometeRow])).toBe(
      "Avec réinvestissement automatique de 100% des dividendes + 50 €/mois de versements programmés."
    );
  });

  it("accepte un réinvestissement partiel sans VP", () => {
    expect(
      buildOptionsComplementFromSouscriptions([
        { ...cometeRow, reinvestissementDividendesPct: "80", vpMontantEur: "" },
      ])
    ).toBe("Avec réinvestissement automatique de 80% des dividendes.");
  });

  it("formate VP trimestriel", () => {
    expect(
      buildOptionsComplementFromSouscriptions([
        {
          ...cometeRow,
          reinvestissementDividendesPct: "",
          vpMontantEur: "150",
          vpFrequence: "trimestre",
        },
      ])
    ).toBe("Avec 150 €/trimestre de versements programmés.");
  });
});

describe("shouldAutoSyncMesPreconisationsText", () => {
  it("sync si vide ou identique au dernier auto", () => {
    expect(shouldAutoSyncMesPreconisationsText("", "auto")).toBe(true);
    expect(shouldAutoSyncMesPreconisationsText("auto", "auto")).toBe(true);
    expect(shouldAutoSyncMesPreconisationsText("retouche manuelle", "auto")).toBe(false);
  });
});

describe("buildMesPreconisationsFromSouscriptions", () => {
  it("génère le format type (intro + paragraphe unique avec parts et options)", () => {
    const text = buildMesPreconisationsFromSouscriptions([cometeRow]);
    expect(text).toMatch(/investissement global de 30[\s\u202f]?000/);
    expect(text).toContain("SCPI de rendement Comète");
    expect(text).toContain("250 € la part x 120 parts");
    expect(text).toContain(" ; Avec réinvestissement automatique de 100%");
    expect(text.split("\n\n")).toHaveLength(2);
  });

  it("calcule le nombre de parts pour un montant élevé (Comète 250 €)", () => {
    const text = buildMesPreconisationsFromSouscriptions([
      { ...cometeRow, montantSouscritEur: "100000" },
    ]);
    expect(text).toContain("250 € la part x 400 parts");
  });
});

describe("normalizeScpiAnnexeSouscriptions", () => {
  const legacyMes = buildMesPreconisationsFromSouscriptions(defaultScpiAnnexeSouscriptions());

  it("migre les anciennes clés produit", () => {
    expect(normalizeScpiAnnexeSouscriptions(undefined, ["comete"])).toEqual([
      {
        productKey: "comete",
        montantSouscritEur: "",
        partPriceEur: "250",
        reinvestissementDividendesPct: "",
        vpMontantEur: "",
        vpFrequence: "mois",
      },
    ]);
  });

  it("reprend le montant depuis l’ancien texte « Mes préconisations »", () => {
    const rows = normalizeScpiAnnexeSouscriptions(
      undefined,
      ["comete"],
      legacyMes
    );
    expect(rows[0].montantSouscritEur).toBe("30000");
  });

  it("enrichit des lignes structurées sans montant depuis le texte legacy", () => {
    const rows = normalizeScpiAnnexeSouscriptions(
      [{ productKey: "comete", montantSouscritEur: "", partPriceEur: "250" }],
      undefined,
      legacyMes
    );
    expect(rows[0].montantSouscritEur).toBe("30000");
  });
});

describe("upsertScpiAnnexeSouscription", () => {
  it("ajoute ou retire une SCPI avec prix de part catalogue", () => {
    const withComete = upsertScpiAnnexeSouscription([], "comete", true);
    expect(withComete[0].partPriceEur).toBe("250");
    expect(withComete[0].vpFrequence).toBe("mois");
    expect(upsertScpiAnnexeSouscription(withComete, "comete", false)).toEqual([]);
  });
});

describe("defaultScpiAnnexeSouscriptions", () => {
  it("préremplit Comète avec réinvest. 100 % et VP 50 €/mois", () => {
    expect(defaultScpiAnnexeSouscriptions()).toEqual([cometeRow]);
  });
});
