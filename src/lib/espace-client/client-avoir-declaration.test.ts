import { describe, expect, it } from "vitest";
import { PLAFOND_DECLARATION_CENTIMES } from "./scpi-client-tracking";
import { validateClientAvoirDeclaration } from "./client-avoir-declaration";

const NOW = Math.floor(Date.UTC(2026, 7, 13) / 1000);

describe("validateClientAvoirDeclaration", () => {
  const base = {
    panier: "placements",
    typeProduit: "PER",
    nomProduit: "Swisslife",
    valorisationCentimes: 12_000_00,
  };

  it("accepte une saisie minimale", () => {
    const result = validateClientAvoirDeclaration(base, NOW);
    expect(result).toMatchObject({
      ok: true,
      typeProduit: "PER",
      nomProduit: "Swisslife",
      dateSouscription: null,
    });
  });

  it("refuse un type hors panier", () => {
    expect(
      validateClientAvoirDeclaration({ ...base, panier: "immobilier" }, NOW)
    ).toBe("type_invalide");
  });

  it("accepte SCPI et SCPI démembrement dans le panier SCPI", () => {
    expect(
      validateClientAvoirDeclaration(
        { ...base, panier: "scpi", typeProduit: "SCPI", nomProduit: "Corum" },
        NOW
      )
    ).toMatchObject({ ok: true, typeProduit: "SCPI" });
    expect(
      validateClientAvoirDeclaration(
        {
          ...base,
          panier: "scpi",
          typeProduit: "SCPI_DEMEMBREMENT",
          nomProduit: "Corum NP",
        },
        NOW
      )
    ).toMatchObject({ ok: true, typeProduit: "SCPI_DEMEMBREMENT" });
    expect(
      validateClientAvoirDeclaration(
        { ...base, panier: "immobilier", typeProduit: "SCPI", nomProduit: "Corum" },
        NOW
      )
    ).toBe("type_invalide");
  });

  it("accepte un compte à terme CAT dans l'épargne", () => {
    expect(
      validateClientAvoirDeclaration(
        { ...base, panier: "epargne", typeProduit: "CAT", nomProduit: "CAT Crédit Agricole" },
        NOW
      )
    ).toMatchObject({ ok: true, typeProduit: "CAT" });
  });

  it("refuse un nom vide et une valorisation nulle", () => {
    expect(
      validateClientAvoirDeclaration({ ...base, nomProduit: " " }, NOW)
    ).toBe("nom_invalide");
    expect(
      validateClientAvoirDeclaration({ ...base, valorisationCentimes: 0 }, NOW)
    ).toBe("valorisation_invalide");
  });

  it("accepte une date de souscription passée, refuse le futur", () => {
    expect(
      validateClientAvoirDeclaration(
        { ...base, dateSouscription: "2020-01-15" },
        NOW
      )
    ).toMatchObject({ ok: true, dateSouscription: "2020-01-15" });
    expect(
      validateClientAvoirDeclaration(
        { ...base, dateSouscription: "2027-01-01" },
        NOW
      )
    ).toBe("date_future");
  });

  it("accepte loyer, mensualité et fin de prêt sur un bien immobilier", () => {
    expect(
      validateClientAvoirDeclaration(
        {
          panier: "immobilier",
          typeProduit: "LMNP",
          nomProduit: "Studio Lyon",
          valorisationCentimes: 180_000_00,
          loyerMensuelCentimes: 850_00,
          mensualiteCreditCentimes: 1_200_00,
          dateFinPret: "2035-06-01",
        },
        NOW
      )
    ).toMatchObject({
      ok: true,
      loyerMensuelCentimes: 850_00,
      mensualiteCreditCentimes: 1_200_00,
      dateFinPret: "2035-06-01",
    });
  });

  it("ignore le crédit hors immobilier et refuse une mensualité absurde", () => {
    expect(
      validateClientAvoirDeclaration(
        { ...base, mensualiteCreditCentimes: 1_200_00 },
        NOW
      )
    ).toMatchObject({ ok: true, mensualiteCreditCentimes: null });
    expect(
      validateClientAvoirDeclaration(
        {
          panier: "immobilier",
          typeProduit: "LMNP",
          nomProduit: "Studio Lyon",
          valorisationCentimes: 180_000_00,
          mensualiteCreditCentimes: PLAFOND_DECLARATION_CENTIMES + 1,
        },
        NOW
      )
    ).toBe("mensualite_invalide");
  });

  it("refuse un bien meuble sans nom de produit", () => {
    const baseMeuble = {
      panier: "meubles" as const,
      valorisationCentimes: 8_000_00,
    };
    expect(
      validateClientAvoirDeclaration(
        { ...baseMeuble, typeProduit: "OBJET_ART", nomProduit: "" },
        NOW
      )
    ).toBe("nom_invalide");
    expect(
      validateClientAvoirDeclaration(
        { ...baseMeuble, typeProduit: "PARTS_SOCIETE", nomProduit: "" },
        NOW
      )
    ).toBe("nom_invalide");
  });

  it("mappe PEE et PERCOL en épargne salariale nommée", () => {
    expect(
      validateClientAvoirDeclaration(
        {
          panier: "placements",
          typeProduit: "EPARGNE_SALARIALE",
          nomProduit: "PEE",
          valorisationCentimes: 15_000_00,
        },
        NOW
      )
    ).toMatchObject({
      ok: true,
      typeProduit: "EPARGNE_SALARIALE",
      nomProduit: "PEE",
    });
    expect(
      validateClientAvoirDeclaration(
        {
          panier: "placements",
          typeProduit: "EPARGNE_SALARIALE",
          nomProduit: "PERCOL",
          valorisationCentimes: 22_000_00,
        },
        NOW
      )
    ).toMatchObject({
      ok: true,
      typeProduit: "EPARGNE_SALARIALE",
      nomProduit: "PERCOL",
    });
  });

  it("garde le nom saisi pour des parts de société", () => {
    expect(
      validateClientAvoirDeclaration(
        {
          panier: "meubles",
          typeProduit: "PARTS_SOCIETE",
          nomProduit: "SARL Dupont",
          valorisationCentimes: 50_000_00,
          dateSouscription: "2024-03-01",
        },
        NOW
      )
    ).toMatchObject({
      ok: true,
      nomProduit: "SARL Dupont",
      dateSouscription: "2024-03-01",
    });
  });
});
