import { describe, expect, it } from "vitest";
import { parseCouplePatrimoine } from "./rio-couple";
import type { ExtractedData } from "../types";

/**
 * Tableau patrimoine d'un RIO couple : 3 colonnes (conjoint 1, conjoint 2,
 * Total). Reproduit les colonnes « détenteur » vides « - » et les actifs
 * homonymes détenus par chaque conjoint.
 */
const patrimoineSection = [
  "Désignation\tDURAND Claire\tMOREAU Guillaume\tTotal",
  "Immobilier\t250000 €\t250000 €\t500000 €",
  "Immobilier de jouissance\t200000 €\t200000 €\t400000 €",
  "Résidence principale - RP\t-\t-\t400000 €",
  "Immobilier locatif\t50000 €\t250000 €\t300000 €",
  "Classique - Studio A\t100000 €\t-\t100000 €",
  "Classique - Studio A\t-\t200000 €\t200000 €",
  "Financier\t15000 €\t11000 €\t26000 €",
  "Épargne bancaire\t10000 €\t8000 €\t18000 €",
  "Livret A - LA\t10000 €\t-\t10000 €",
  "Livret A - LA\t-\t8000 €\t8000 €",
  "Épargne financière\t5000 €\t3000 €\t8000 €",
  "Assurance vie - Contrat\t5000 €\t-\t5000 €",
  "Assurance vie - Contrat\t-\t3000 €\t3000 €",
  "TOTAL\t265000 €\t261000 €\t526000 €",
  "Passifs",
  "Désignation\tEmprunteur\tEchéance par an\tCRD   Date d'échéance",
  "TOTAL\t0 €\t0 €",
].join("\n");

describe("RIO couple — noms d'actifs propres + ids uniques", () => {
  const data: ExtractedData = { typeDocument: "RIO", raw: "" };
  parseCouplePatrimoine(patrimoineSection, data);

  it("nettoie les colonnes détenteur vides dans les noms", () => {
    const noms = [
      ...(data.biensImmobiliers ?? []).map((b) => b.nom),
      ...(data.contratsFinanciers ?? []).map((c) => c.nom),
    ];
    expect(noms.length).toBeGreaterThan(0);
    for (const nom of noms) {
      expect(nom).not.toMatch(/\t/);
      expect(nom).not.toMatch(/[-–—]\s*$/);
    }
    const rp = data.biensImmobiliers?.find((b) => b.type === "RESIDENCE_PRINCIPALE");
    expect(rp?.nom).toBe("RP");
  });

  it("attribue un id unique aux biens homonymes (pas d'écrasement)", () => {
    const studios = data.biensImmobiliers?.filter((b) => b.nom === "Studio A") ?? [];
    expect(studios).toHaveLength(2);
    expect(new Set(studios.map((b) => b.id)).size).toBe(2);
    expect(studios.map((b) => b.valeur ?? 0).sort((a, b) => a - b)).toEqual([100000, 200000]);
  });

  it("conserve les contrats homonymes des deux conjoints", () => {
    const livrets = data.contratsFinanciers?.filter((c) => c.type === "LIVRET_A") ?? [];
    expect(livrets).toHaveLength(2);
    expect(new Set(livrets.map((c) => c.id)).size).toBe(2);
    expect(livrets.map((c) => c.montant).sort((a, b) => a - b)).toEqual([8000, 10000]);
    expect(livrets.every((c) => c.rioOwnerHint != null)).toBe(true);

    const av = data.contratsFinanciers?.filter((c) => c.type === "ASSURANCE_VIE") ?? [];
    expect(av).toHaveLength(2);
    expect(new Set(av.map((c) => c.id)).size).toBe(2);

    expect(data.livretA).toBe(18000);
    expect(data.assuranceVie).toBe(8000);
  });

  it("pose un hint détenteur sur les actifs extraits", () => {
    const withHint = [
      ...(data.biensImmobiliers ?? []),
      ...(data.contratsFinanciers ?? []),
    ].filter((item) => item.rioOwnerHint != null);
    expect(withHint.length).toBeGreaterThan(0);
  });
});

describe("RIO couple — livret classique, LDD homonyme, SCPI usufruit", () => {
  const section = [
    "Désignation\tLea BERNARD\tLuc LEGRAND\tTotal",
    "Immobilier locatif\t95550 €\t0 €\t95550 €",
    "Classique - SCPI usufruit\t95550 €\t-\t95550 €",
    "Épargne bancaire\t22000 €\t12000 €\t34000 €",
    "Livret classique - CERISE\t10000 €\t-\t10000 €",
    "LDD - LDD\t12000 €\t-\t12000 €",
    "LDD - LDD\t-\t12000 €\t12000 €",
    "TOTAL\t117550 €\t12000 €\t129550 €",
  ].join("\n");

  const data: ExtractedData = { typeDocument: "RIO", raw: "" };
  parseCouplePatrimoine(section, data);

  it("classe le livret CERISE en livret, pas en locatif", () => {
    expect(data.biensImmobiliers?.some((b) => b.nom === "CERISE")).toBeFalsy();
    expect(data.contratsFinanciers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "LIVRET_A",
          nom: "CERISE",
          montant: 10000,
          rioOwnerHint: "person1",
        }),
      ])
    );
  });

  it("garde les deux LDD de même montant", () => {
    const ldds = data.contratsFinanciers?.filter((c) => c.type === "LDDS") ?? [];
    expect(ldds).toHaveLength(2);
    expect(ldds.map((c) => c.rioOwnerHint).sort()).toEqual(["person1", "person2"]);
  });

  it("classe la SCPI en usufruit en SCPI", () => {
    expect(data.biensImmobiliers?.some((b) => /usufruit/i.test(b.nom))).toBeFalsy();
    expect(data.contratsFinanciers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "SCPI",
          nom: "SCPI usufruit",
          montant: 95550,
          rioOwnerHint: "person1",
        }),
      ])
    );
  });
});
