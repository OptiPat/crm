import { describe, expect, it } from "vitest";
import {
  formatDisponibiliteLabel,
  getDisponibiliteHorizon,
} from "./disponibilite";

describe("getDisponibiliteHorizon", () => {
  it("isole la résidence principale sur une ligne dédiée", () => {
    expect(getDisponibiliteHorizon({ type_produit: "RESIDENCE_PRINCIPALE" })).toBe(
      "residence_principale"
    );
    expect(getDisponibiliteHorizon({ type_produit: "RP" })).toBe(
      "residence_principale"
    );
  });

  it("classe l'immobilier locatif en long terme", () => {
    expect(getDisponibiliteHorizon({ type_produit: "LMNP" })).toBe("long_terme");
    expect(getDisponibiliteHorizon({ type_produit: "PINEL" })).toBe("long_terme");
  });

  it("classe les SCPI en long terme", () => {
    expect(getDisponibiliteHorizon({ type_produit: "SCPI" })).toBe("long_terme");
    expect(getDisponibiliteHorizon({ type_produit: "SCPI_DEMEMBREMENT" })).toBe(
      "long_terme"
    );
    expect(getDisponibiliteHorizon({ type_produit: "SCPI_FISCALE" })).toBe(
      "long_terme"
    );
  });

  it("classe PER en long terme", () => {
    expect(getDisponibiliteHorizon({ type_produit: "PER" })).toBe("long_terme");
  });

  it("lit PEE / PEI dans le type ou le nom → moyen terme", () => {
    expect(getDisponibiliteHorizon({ type_produit: "PEE" })).toBe("moyen_terme");
    expect(getDisponibiliteHorizon({ type_produit: "PEI" })).toBe("moyen_terme");
    expect(
      getDisponibiliteHorizon({
        type_produit: "EPARGNE_SALARIALE",
        nom_produit: "PEE",
      })
    ).toBe("moyen_terme");
    expect(
      getDisponibiliteHorizon({
        type_produit: "EPARGNE_SALARIALE",
        nom_produit: "PEE Amundi",
      })
    ).toBe("moyen_terme");
    expect(
      getDisponibiliteHorizon({
        type_produit: "EPARGNE_SALARIALE",
        nom_produit: "PEI entreprise",
      })
    ).toBe("moyen_terme");
  });

  it("lit PERCO / PERCOL / PERECO dans le type ou le nom → long terme", () => {
    expect(getDisponibiliteHorizon({ type_produit: "PERCO" })).toBe("long_terme");
    expect(getDisponibiliteHorizon({ type_produit: "PERCOL" })).toBe("long_terme");
    expect(
      getDisponibiliteHorizon({
        type_produit: "EPARGNE_SALARIALE",
        nom_produit: "PERCOL",
      })
    ).toBe("long_terme");
    expect(
      getDisponibiliteHorizon({
        type_produit: "EPARGNE_SALARIALE",
        nom_produit: "PERCO+",
      })
    ).toBe("long_terme");
    expect(
      getDisponibiliteHorizon({
        type_produit: "EPARGNE_SALARIALE",
        nom_produit: "PERECO",
      })
    ).toBe("long_terme");
    expect(
      getDisponibiliteHorizon({
        type_produit: "EPARGNE_SALARIALE",
        nom_produit: "Amundi",
      })
    ).toBe("long_terme");
  });

  it("classe assurance-vie, PEA et CTO en moyen terme", () => {
    expect(getDisponibiliteHorizon({ type_produit: "ASSURANCE_VIE" })).toBe(
      "moyen_terme"
    );
    expect(getDisponibiliteHorizon({ type_produit: "PEA" })).toBe("moyen_terme");
    expect(getDisponibiliteHorizon({ type_produit: "COMPTE_TITRE" })).toBe(
      "moyen_terme"
    );
    expect(getDisponibiliteHorizon({ type_produit: "COMPTE_TITRES" })).toBe(
      "moyen_terme"
    );
  });

  it("classe l'épargne bancaire en court terme", () => {
    expect(getDisponibiliteHorizon({ type_produit: "LIVRET_A" })).toBe(
      "court_terme"
    );
    expect(getDisponibiliteHorizon({ type_produit: "LDD" })).toBe("court_terme");
    expect(getDisponibiliteHorizon({ type_produit: "COMPTE_COURANT" })).toBe(
      "court_terme"
    );
    expect(getDisponibiliteHorizon({ type_produit: "EPARGNE_BANCAIRE" })).toBe(
      "court_terme"
    );
  });

  it("n'expose jamais de libellé « bloqué »", () => {
    const labels = (
      [
        "court_terme",
        "moyen_terme",
        "long_terme",
        "residence_principale",
      ] as const
    ).map(formatDisponibiliteLabel);
    expect(labels).toEqual([
      "Court terme",
      "Moyen terme",
      "Long terme",
      "Résidence principale",
    ]);
    expect(labels.some((l) => /bloqu/i.test(l))).toBe(false);
  });
});
