import { describe, expect, it } from "vitest";
import type { Investissement } from "@/lib/api/tauri-investissements";
import {
  buildRioMatchContext,
  findBestRioInvestissementMatch,
  findCompatibleExistingInvestissements,
  matchRioExtractedInvestissements,
  normalizeInvestmentLabel,
  typesAreCompatible,
} from "./rio-investissement-match";
import type { Partenaire } from "@/lib/api/tauri-partenaires";

const baseInv = (overrides: Partial<Investissement>): Investissement =>
  ({
    id: 1,
    contact_id: 1,
    type_produit: "LIVRET_A",
    nom_produit: "Livret A",
    montant_initial: 2_055_000,
    origine: "EXISTANT_CLIENT",
    versement_programme: false,
    reinvestissement_dividendes: false,
    created_at: 0,
    updated_at: 0,
    ...overrides,
  }) as Investissement;

describe("rio-investissement-match", () => {
  it("normalise les libellés", () => {
    expect(normalizeInvestmentLabel("LA enfants")).toBe("laenfants");
    expect(normalizeInvestmentLabel("Livret A")).toBe("livreta");
  });

  it("compatibilité types immo et épargne", () => {
    expect(typesAreCompatible("LIVRET_A", "LIVRET_A")).toBe(true);
    expect(typesAreCompatible("RP", "RESIDENCE_PRINCIPALE")).toBe(true);
    expect(typesAreCompatible("LIVRET_A", "ASSURANCE_VIE")).toBe(false);
  });

  it("rapproche LA et Livret A par montant", () => {
    const existing = [
      baseInv({ id: 1, nom_produit: "Livret A", montant_initial: 2_055_000 }),
      baseInv({ id: 2, nom_produit: "Livret A enfants", montant_initial: 222_000 }),
    ];
    const match = findBestRioInvestissementMatch(
      { id: "a", type: "LIVRET_A", label: "LA", montant: 20_550 },
      existing
    );
    expect(match?.id).toBe(1);
  });

  it("rapproche LA enfants séparément", () => {
    const existing = [
      baseInv({ id: 1, nom_produit: "Livret A", montant_initial: 2_055_000 }),
      baseInv({ id: 2, nom_produit: "Livret A enfants", montant_initial: 222_000 }),
    ];
    const match = findBestRioInvestissementMatch(
      { id: "b", type: "LIVRET_A", label: "LA enfants", montant: 2_220 },
      existing
    );
    expect(match?.id).toBe(2);
  });

  it("rapproche une assurance-vie par nom produit", () => {
    const existing = [
      baseInv({
        id: 10,
        type_produit: "ASSURANCE_VIE",
        nom_produit: "Cristalliance Evoluvie",
        montant_initial: 8_000_000,
      }),
    ];
    const match = findBestRioInvestissementMatch(
      {
        id: "av",
        type: "ASSURANCE_VIE",
        label: "Cristalliance Evoluvie",
        montant: 80_000,
      },
      existing
    );
    expect(match?.id).toBe(10);
  });

  it("ne confond pas deux SCPI différentes avec montants proches", () => {
    const existing = [
      baseInv({
        id: 1,
        type_produit: "SCPI",
        nom_produit: "Comète",
        montant_initial: 8_000_000,
      }),
      baseInv({
        id: 2,
        type_produit: "SCPI",
        nom_produit: "Eurovalys",
        montant_initial: 8_100_000,
      }),
    ];
    const match = findBestRioInvestissementMatch(
      { id: "s", type: "SCPI", label: "SCPI - Eurovalys", montant: 81_000 },
      existing
    );
    expect(match?.id).toBe(2);
  });

  it("matchRioExtractedInvestissements assigne sans réutiliser le même existant", () => {
    const existing = [
      baseInv({ id: 1, nom_produit: "Livret A", montant_initial: 2_055_000 }),
      baseInv({ id: 2, nom_produit: "Livret A enfants", montant_initial: 222_000 }),
    ];
    const map = matchRioExtractedInvestissements(
      [
        { id: "1", type: "LIVRET_A", label: "LA", montant: 20_550 },
        { id: "2", type: "LIVRET_A", label: "LA enfants", montant: 2_220 },
      ],
      existing
    );
    expect(map.get("1")?.id).toBe(1);
    expect(map.get("2")?.id).toBe(2);
  });

  it("liste les compatibles par type", () => {
    const existing = [
      baseInv({ id: 1, type_produit: "LIVRET_A" }),
      baseInv({ id: 2, type_produit: "ASSURANCE_VIE", nom_produit: "AV" }),
    ];
    expect(findCompatibleExistingInvestissements("LIVRET_A", existing)).toHaveLength(1);
  });

  it("rapproche RP générique et nom propre CRM par valeur", () => {
    const existing = [
      baseInv({
        id: 1,
        type_produit: "RESIDENCE_PRINCIPALE",
        nom_produit: "Primo MTP",
        montant_initial: 420_000_00,
      }),
    ];
    const match = findBestRioInvestissementMatch(
      {
        id: "rp",
        type: "RP",
        label: "Résidence principale",
        montant: 420_000,
      },
      existing
    );
    expect(match?.id).toBe(1);
  });

  it("rapproche libellés RP synonymes", () => {
    const existing = [
      baseInv({
        id: 1,
        type_produit: "RP",
        nom_produit: "Résidence Principale",
        montant_initial: 350_000_00,
      }),
    ];
    const match = findBestRioInvestissementMatch(
      { id: "rp2", type: "RESIDENCE_PRINCIPALE", label: "RP", montant: 350_000 },
      existing
    );
    expect(match?.id).toBe(1);
  });

  it("distingue deux locatifs par montant", () => {
    const existing = [
      baseInv({
        id: 1,
        type_produit: "LOCATIF",
        nom_produit: "Appartement Lyon",
        montant_initial: 150_000_00,
      }),
      baseInv({
        id: 2,
        type_produit: "LMNP",
        nom_produit: "Studio Bordeaux",
        montant_initial: 95_000_00,
      }),
    ];
    const match = findBestRioInvestissementMatch(
      { id: "l1", type: "LOCATIF", label: "Immobilier locatif", montant: 95_000 },
      existing
    );
    expect(match?.id).toBe(2);
  });

  it("rapproche un bien immo nommé par libellé", () => {
    const existing = [
      baseInv({
        id: 1,
        type_produit: "RP",
        nom_produit: "Primo MTP",
        montant_initial: 420_000_00,
      }),
    ];
    const match = findBestRioInvestissementMatch(
      { id: "rp3", type: "RP", label: "Primo MTP", montant: 418_000 },
      existing
    );
    expect(match?.id).toBe(1);
  });

  it("rapproche Cristalliance Avenir via partenaire Vie Plus", () => {
    const existing = [
      baseInv({
        id: 20,
        type_produit: "ASSURANCE_VIE",
        nom_produit: "Contrat AV client",
        montant_initial: 5_000_000,
        partenaire_id: 1,
      }),
    ];
    const context = buildRioMatchContext([
      { id: 1, raison_sociale: "Vie Plus" } as Partenaire,
    ]);
    const match = findBestRioInvestissementMatch(
      {
        id: "av-avenir",
        type: "ASSURANCE_VIE",
        label: "Cristalliance Avenir",
        montant: 50_000,
      },
      existing,
      context
    );
    expect(match?.id).toBe(20);
  });

  it("rapproche Cristalliance Evoluvie via partenaire Apicil", () => {
    const existing = [
      baseInv({
        id: 21,
        type_produit: "ASSURANCE_VIE",
        nom_produit: "Assurance vie",
        montant_initial: 8_000_000,
        partenaire_id: 2,
      }),
    ];
    const context = buildRioMatchContext([
      { id: 2, raison_sociale: "Apicil" } as Partenaire,
    ]);
    const match = findBestRioInvestissementMatch(
      {
        id: "av-evoluvie",
        type: "ASSURANCE_VIE",
        label: "Cristalliance Evoluvie",
        montant: 80_000,
      },
      existing,
      context
    );
    expect(match?.id).toBe(21);
  });

  it("rapproche PERtinence Retraite via partenaire Vie Plus", () => {
    const existing = [
      baseInv({
        id: 30,
        type_produit: "PER",
        nom_produit: "PER retraite",
        montant_initial: 3_000_000,
        partenaire_id: 1,
      }),
    ];
    const context = buildRioMatchContext([
      { id: 1, raison_sociale: "Vie Plus" } as Partenaire,
    ]);
    const match = findBestRioInvestissementMatch(
      {
        id: "per",
        type: "PER",
        label: "PERtinence Retraite",
        montant: 30_000,
      },
      existing,
      context
    );
    expect(match?.id).toBe(30);
  });

  it("ne rapproche pas Cristalliance sur montant seul sans partenaire ni nom produit", () => {
    const existing = [
      baseInv({
        id: 41,
        type_produit: "ASSURANCE_VIE",
        nom_produit: "Contrat AV",
        montant_initial: 5_000_000,
      }),
    ];
    const match = findBestRioInvestissementMatch(
      {
        id: "av-generic",
        type: "ASSURANCE_VIE",
        label: "Cristalliance Avenir",
        montant: 50_000,
      },
      existing
    );
    expect(match).toBeUndefined();
  });

  it("rapproche Cristalliance Evoluvie par nom produit sans partenaire_id", () => {
    const existing = [
      baseInv({
        id: 42,
        type_produit: "ASSURANCE_VIE",
        nom_produit: "Cristalliance Evoluvie",
        montant_initial: 8_000_000,
      }),
    ];
    const match = findBestRioInvestissementMatch(
      {
        id: "av-name",
        type: "ASSURANCE_VIE",
        label: "Cristalliance Evoluvie",
        montant: 80_000,
      },
      existing
    );
    expect(match?.id).toBe(42);
  });

  it("ne rapproche pas Cristalliance si partenaire CRM différent", () => {
    const existing = [
      baseInv({
        id: 40,
        type_produit: "ASSURANCE_VIE",
        nom_produit: "Contrat AV",
        montant_initial: 5_000_000,
        partenaire_id: 3,
      }),
    ];
    const context = buildRioMatchContext([
      { id: 3, raison_sociale: "Generali" } as Partenaire,
    ]);
    const match = findBestRioInvestissementMatch(
      {
        id: "av-wrong",
        type: "ASSURANCE_VIE",
        label: "Cristalliance Avenir",
        montant: 50_000,
      },
      existing,
      context
    );
    expect(match).toBeUndefined();
  });
});
