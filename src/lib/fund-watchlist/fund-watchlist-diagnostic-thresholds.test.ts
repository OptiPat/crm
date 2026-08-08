import { describe, expect, it } from "vitest";
import {
  getFundDiagnosticDeltaThresholds,
  getFundDiagnosticDeltaThresholdsFromMeasure,
  isFundCategoryExcludedFromDiagnostic,
  isSameFundWatchlistPeerCategory,
  resolveFundDiagnosticVolatilityClass,
  resolveFundDiagnosticVolatilityClassFromMeasure,
} from "@/lib/fund-watchlist/fund-watchlist-diagnostic-thresholds";

describe("fund-watchlist-diagnostic-thresholds", () => {
  it("classe Actions Europe en volatilité actions", () => {
    expect(resolveFundDiagnosticVolatilityClass("Actions Europe")).toBe("actions");
    expect(getFundDiagnosticDeltaThresholds("Actions Europe").surveillance).toBe(-2);
    expect(getFundDiagnosticDeltaThresholds("Actions Europe").arbitrage).toBe(-4);
  });

  it("classe obligations en volatilité faible", () => {
    expect(resolveFundDiagnosticVolatilityClass("Obligations Euro")).toBe("rates");
    expect(getFundDiagnosticDeltaThresholds("Obligations Euro").surveillance).toBe(-0.8);
    expect(getFundDiagnosticDeltaThresholds("Obligations Euro").arbitrage).toBe(-1.5);
  });

  it("classe diversifié en volatilité moyenne", () => {
    expect(resolveFundDiagnosticVolatilityClass("Fonds diversifié")).toBe("diversified");
    expect(getFundDiagnosticDeltaThresholds("Fonds diversifié").surveillance).toBe(-1.5);
    expect(getFundDiagnosticDeltaThresholds("Fonds diversifié").arbitrage).toBe(-3);
  });

  it("préfère la volatilité mesurée au libellé de catégorie", () => {
    const label = "Actions Europe Gdes Cap. Mixte";
    expect(resolveFundDiagnosticVolatilityClass(label)).toBe("actions");
    expect(resolveFundDiagnosticVolatilityClassFromMeasure(1.2, label)).toBe("rates");
    expect(getFundDiagnosticDeltaThresholdsFromMeasure(1.2, label)).toMatchObject({
      surveillance: -0.8,
      arbitrage: -1.5,
    });
  });

  it("classe en taux les produits que les mots-clés voyaient en actions", () => {
    // Aucun de ces libellés ne contient de mot reconnu : ils héritaient des seuils actions
    // (−2 / −4), bien trop larges. La table les rattache à leur profil réel.
    expect(resolveFundDiagnosticVolatilityClassFromMeasure(null, "FONDS A CAPITAL GARANTI")).toBe(
      "rates"
    );
    expect(resolveFundDiagnosticVolatilityClassFromMeasure(null, "FONDS A CAPITAL PROTEGE")).toBe(
      "rates"
    );
    expect(resolveFundDiagnosticVolatilityClassFromMeasure(null, "Fonds à horizon 2026-2030")).toBe(
      "rates"
    );
    expect(resolveFundDiagnosticVolatilityClassFromMeasure(null, "EUR Subordinated Bond")).toBe(
      "diversified"
    );
    expect(resolveFundDiagnosticVolatilityClassFromMeasure(null, "Convertibles Europe")).toBe(
      "diversified"
    );
    // Le market neutral partage désormais la famille du long/short : sans volatilité mesurée,
    // c'est le profil moyen de cette famille (1,8 à 9,4 % observés) qui sert de repli. En
    // pratique l'import fournit la volatilité du fonds, qui l'emporte sur ce proxy.
    expect(
      resolveFundDiagnosticVolatilityClassFromMeasure(null, "Alt - Market Neutral - Actions")
    ).toBe("diversified");
    expect(resolveFundDiagnosticVolatilityClassFromMeasure(4.8, "Alt - Market Neutral - Actions")).toBe(
      "rates"
    );
  });

  it("classe par paliers de volatilité 3 ans", () => {
    expect(resolveFundDiagnosticVolatilityClassFromMeasure(4.9, "Actions Europe")).toBe("rates");
    expect(resolveFundDiagnosticVolatilityClassFromMeasure(5, "Actions Europe")).toBe(
      "diversified"
    );
    expect(resolveFundDiagnosticVolatilityClassFromMeasure(11.9, "Actions Europe")).toBe(
      "diversified"
    );
    expect(resolveFundDiagnosticVolatilityClassFromMeasure(12, "Obligations Euro")).toBe("actions");
    expect(resolveFundDiagnosticVolatilityClassFromMeasure(18, "Obligations Euro")).toBe("actions");
  });

  it("retombe sur le libellé quand la volatilité manque ou est aberrante", () => {
    expect(resolveFundDiagnosticVolatilityClassFromMeasure(null, "Obligations Euro")).toBe("rates");
    expect(resolveFundDiagnosticVolatilityClassFromMeasure(undefined, "Actions Europe")).toBe(
      "actions"
    );
    expect(resolveFundDiagnosticVolatilityClassFromMeasure(0, "Obligations Euro")).toBe("rates");
    expect(resolveFundDiagnosticVolatilityClassFromMeasure(-3, "Actions Europe")).toBe("actions");
    expect(resolveFundDiagnosticVolatilityClassFromMeasure(Number.NaN, "Fonds diversifié")).toBe(
      "diversified"
    );
  });

  it("sépare les libellés que les mots-clés confondaient", () => {
    // « Global Diversified Bond » contient « diversifie » : il passait pour un fonds diversifié.
    expect(
      isSameFundWatchlistPeerCategory("Global Diversified Bond", "Allocation EUR Flexible")
    ).toBe(false);
    // L'immobilier zone euro tombait dans les actions européennes par ordre des règles.
    expect(
      isSameFundWatchlistPeerCategory(
        "Immobilier - Indirect Zone Euro",
        "Actions Zone Euro Grandes Cap."
      )
    ).toBe(false);
    // Le haut rendement n'est plus le pair des emprunts d'État.
    expect(
      isSameFundWatchlistPeerCategory(
        "Obligations EUR Haut Rendement",
        "Obligations EUR Emprunts d'Etat"
      )
    ).toBe(false);
    // Une allocation prudente n'est plus le pair d'une agressive.
    expect(
      isSameFundWatchlistPeerCategory("Allocation EUR Prudente", "Allocation EUR Agressive")
    ).toBe(false);
  });

  it("regroupe les libellés d'une même famille de la table", () => {
    expect(
      isSameFundWatchlistPeerCategory(
        "Actions Europe Gdes Cap. Croissance",
        "Actions France Grandes Cap."
      )
    ).toBe(true);
    expect(
      isSameFundWatchlistPeerCategory("Actions Italie", "Actions Suisse Grandes Cap.")
    ).toBe(true);
    // Grandes et petites capitalisations européennes restent séparées.
    expect(
      isSameFundWatchlistPeerCategory(
        "Actions Europe Gdes Cap. Mixte",
        "Actions Europe Petites Cap."
      )
    ).toBe(false);
    // Les secteurs proches sont regroupés quand l'offre du contrat est trop étroite pour qu'une
    // médiane existe : sans cela, un fonds seul de sa famille n'obtient jamais de badge.
    expect(
      isSameFundWatchlistPeerCategory("Actions Secteur Santé", "Actions Secteur Biotechnologie")
    ).toBe(true);
    expect(
      isSameFundWatchlistPeerCategory("Actions Secteur Eau", "Actions Secteur Ecologie")
    ).toBe(true);
    expect(isSameFundWatchlistPeerCategory("Actions Chine", "Actions Asie hors Japon")).toBe(true);
    expect(
      isSameFundWatchlistPeerCategory(
        "Alt - Market Neutral - Actions",
        "Alt - Long/Short Actions - Europe"
      )
    ).toBe(true);
    expect(
      isSameFundWatchlistPeerCategory(
        "Obligations EUR Emprunts d'Etat",
        "Obligations EUR Emprunts Privés"
      )
    ).toBe(true);
    // Les secteurs sans voisin défendable restent séparés : un fonds de banques ne se juge pas
    // contre les technologies.
    expect(
      isSameFundWatchlistPeerCategory("Actions Secteur Finance", "Actions Secteur Technologies")
    ).toBe(false);
  });

  it("exclut le FCPR du diagnostic", () => {
    expect(isFundCategoryExcludedFromDiagnostic("FCPR")).toBe(true);
    expect(isFundCategoryExcludedFromDiagnostic("fcpr")).toBe(true);
    expect(isFundCategoryExcludedFromDiagnostic("Actions Europe Petites Cap.")).toBe(false);
    expect(isFundCategoryExcludedFromDiagnostic(null)).toBe(false);
  });

  it("associe Japon Morningstar (Growth / Blend) et Asie en méta-catégorie", () => {
    expect(
      isSameFundWatchlistPeerCategory(
        "Japan Large-Cap Growth Equity",
        "Japan Large-Cap Blend Equity"
      )
    ).toBe(true);
    expect(
      isSameFundWatchlistPeerCategory(
        "Japan Large-Cap Blend Equity",
        "Actions Asie Pacifique"
      )
    ).toBe(true);
    expect(
      isSameFundWatchlistPeerCategory(
        "Actions Asie Pacifique",
        "Actions Marchés Emergents Asie"
      )
    ).toBe(true);
  });
});
