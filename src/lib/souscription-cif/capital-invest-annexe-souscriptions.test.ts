import { describe, expect, it } from "vitest";
import {
  addCapitalInvestAnnexeSouscription,
  buildMesPreconisationsFromCapitalInvestSouscriptions,
  computeCapitalInvestMontantSouscrit,
  computeCapitalInvestTotalVerse,
  ensureUniqueCapitalInvestAnnexeSouscriptionIds,
  formatCapitalInvestFundPhrase,
  newCapitalInvestAnnexeSouscription,
  normalizeCapitalInvestAnnexeSouscriptions,
} from "@/lib/souscription-cif/capital-invest-annexe-souscriptions";

describe("capital-invest-annexe-souscriptions", () => {
  it("formate la phrase produit selon le type", () => {
    expect(formatCapitalInvestFundPhrase("fcpr", "Alpha")).toBe("du FCPR Alpha");
    expect(formatCapitalInvestFundPhrase("fcpi", "Odyssée")).toBe("du FCPI Odyssée");
    expect(formatCapitalInvestFundPhrase("fpci", "Odysée M2")).toBe("du FPCI Odysée M2");
    expect(formatCapitalInvestFundPhrase("fip", "Proximité")).toBe("du FIP Proximité");
    expect(formatCapitalInvestFundPhrase("fip-outre-mer", "Horizon")).toBe(
      "du FIP Outre-Mer Horizon"
    );
  });

  it("calcule montant = nb parts × prix de part, droit d'entrée en sus", () => {
    const row = newCapitalInvestAnnexeSouscription({
      id: "ci-1",
      nbParts: "100",
      partPriceEur: "105",
      droitEntreePct: "5",
    });
    expect(computeCapitalInvestMontantSouscrit(row)).toBe(10500);
    expect(computeCapitalInvestTotalVerse(row)).toBe(11025);
  });

  it("génère le texte Mes préconisations type Odyssée (95 parts × 105 €)", () => {
    const text = buildMesPreconisationsFromCapitalInvestSouscriptions([
      newCapitalInvestAnnexeSouscription({
        id: "ci-1",
        nomFonds: "Odyssée",
        type: "fcpi",
        nbParts: "95",
        partPriceEur: "105",
        droitEntreePct: "5",
      }),
    ]);

    expect(text).toContain("Mes préconisations portent sur");
    expect(text).not.toMatch(/^Mes préconisations :\s*\n/m);
    expect(text).toMatch(/investissement global de 10[\s\u202f]?473,75 €/);
    expect(text).toContain("du FCPI Odyssée");
    expect(text).toContain("105 € la part x 95 parts");
    expect(text).toContain("Dont 5 % de droit d'entrée, soit");
  });

  it("génère le texte Odysée M2 FPCI 200 parts sans « de du »", () => {
    const text = buildMesPreconisationsFromCapitalInvestSouscriptions([
      newCapitalInvestAnnexeSouscription({
        id: "ci-2",
        nomFonds: "Odysée M2",
        type: "fpci",
        nbParts: "200",
        partPriceEur: "105",
        droitEntreePct: "5",
      }),
    ]);

    expect(text).toMatch(/investissement global de 22[\s\u202f]?050 €/);
    expect(text).toContain("du FPCI Odysée M2");
    expect(text).not.toContain("de du");
    expect(text).toContain("21");
    expect(text).toContain("200 parts");
    expect(text).toContain("Dont 5 % de droit d'entrée, soit 1");
    expect(text).toContain("050 €");
  });

  it("migre un ancien brouillon montantSouscritEur → nbParts", () => {
    const rows = normalizeCapitalInvestAnnexeSouscriptions([
      {
        id: "ci-legacy",
        nomFonds: "Test",
        montantSouscritEur: "9975",
        partPriceEur: "105",
      },
    ]);
    expect(rows[0]?.nbParts).toBe("95");
  });

  it("génère Mes préconisations pour FCPI + FIP combinés", () => {
    const rows = [
      newCapitalInvestAnnexeSouscription({
        id: "ci-fcpi",
        nomFonds: "Odyssée",
        type: "fcpi",
        nbParts: "95",
        partPriceEur: "105",
        droitEntreePct: "5",
      }),
      newCapitalInvestAnnexeSouscription(
        {
          id: "ci-fip",
          nomFonds: "Proximité",
          type: "fip",
          nbParts: "50",
          partPriceEur: "100",
          droitEntreePct: "5",
        },
        [{ id: "ci-fcpi" }]
      ),
    ];
    const text = buildMesPreconisationsFromCapitalInvestSouscriptions(rows);
    expect(text).toContain("du FCPI Odyssée");
    expect(text).toContain("du FIP Proximité");
    expect(text.match(/La souscription de parts/g)?.length).toBe(2);
  });

  it("dédoublonne les ids au chargement et à l'ajout", () => {
    const normalized = ensureUniqueCapitalInvestAnnexeSouscriptionIds([
      newCapitalInvestAnnexeSouscription({ id: "ci-1", nomFonds: "A", type: "fcpi" }),
      newCapitalInvestAnnexeSouscription({ id: "ci-1", nomFonds: "B", type: "fip" }),
    ]);
    expect(normalized[0]?.id).toBe("ci-1");
    expect(normalized[1]?.id).not.toBe("ci-1");

    const added = addCapitalInvestAnnexeSouscription([
      newCapitalInvestAnnexeSouscription({ id: "ci-1", nomFonds: "A", type: "fcpi" }),
    ]);
    expect(added).toHaveLength(2);
    expect(added[0]?.id).toBe("ci-1");
    expect(added[1]?.id).not.toBe("ci-1");
  });
});
