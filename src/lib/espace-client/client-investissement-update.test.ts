import { describe, expect, it } from "vitest";
import {
  getClientInvestissementUpdateKind,
  isClientInvestissementUpdateEligible,
  validateClientInvestissementUpdate,
} from "./client-investissement-update";
import { PLAFOND_DECLARATION_CENTIMES } from "./scpi-client-tracking";

describe("client-investissement-update", () => {
  it("classe SCPI (avec moi ou à côté) en scpi", () => {
    expect(
      getClientInvestissementUpdateKind({
        type_produit: "SCPI",
        origine: "MON_CONSEIL",
      })
    ).toBe("scpi");
    expect(
      getClientInvestissementUpdateKind({
        type_produit: "SCPI_FISCALE",
        origine: "EXISTANT_CLIENT",
      })
    ).toBe("scpi");
  });

  it("autorise épargne et placements seulement hors avec moi", () => {
    expect(
      getClientInvestissementUpdateKind({
        type_produit: "LIVRET_A",
        origine: "EXISTANT_CLIENT",
      })
    ).toBe("encours");
    expect(
      getClientInvestissementUpdateKind({
        type_produit: "ASSURANCE_VIE",
        origine: "DECLARE_CLIENT",
      })
    ).toBe("encours");
    expect(
      getClientInvestissementUpdateKind({
        type_produit: "LIVRET_A",
        origine: "MON_CONSEIL",
      })
    ).toBeNull();
    expect(
      getClientInvestissementUpdateKind({
        type_produit: "ASSURANCE_VIE",
        origine: "MON_CONSEIL",
      })
    ).toBeNull();
  });

  it("autorise l'immobilier hors avec moi", () => {
    expect(
      getClientInvestissementUpdateKind({
        type_produit: "LMNP",
        origine: "EXISTANT_CLIENT",
      })
    ).toBe("immobilier");
    expect(
      isClientInvestissementUpdateEligible({
        type_produit: "PINEL",
        origine: "MON_CONSEIL",
      })
    ).toBe(false);
  });

  it("refuse la prévoyance et AUTRE", () => {
    expect(
      getClientInvestissementUpdateKind({
        type_produit: "PREVOYANCE",
        origine: "EXISTANT_CLIENT",
      })
    ).toBeNull();
    expect(
      getClientInvestissementUpdateKind({
        type_produit: "AUTRE",
        origine: "EXISTANT_CLIENT",
      })
    ).toBeNull();
  });

  it("accepte PEA et compte-titres hors avec moi", () => {
    expect(
      getClientInvestissementUpdateKind({
        type_produit: "PEA",
        origine: "EXISTANT_CLIENT",
      })
    ).toBe("encours");
    expect(
      getClientInvestissementUpdateKind({
        type_produit: "COMPTE_TITRE",
        origine: "DECLARE_CLIENT",
      })
    ).toBe("encours");
  });

  it("refuse une date future", () => {
    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);
    const y = future.getFullYear();
    const m = String(future.getMonth() + 1).padStart(2, "0");
    const d = String(future.getDate()).padStart(2, "0");
    expect(
      validateClientInvestissementUpdate(
        { id: 1, type_produit: "LIVRET_A", origine: "EXISTANT_CLIENT" },
        {
          investissementId: 1,
          date: `${y}-${m}-${d}`,
          valorisationCentimes: 1_000_00,
        }
      )
    ).toBe("date_future");
  });

  it("valide une mise à jour encours sans revenu", () => {
    const result = validateClientInvestissementUpdate(
      {
        id: 7,
        type_produit: "LIVRET_A",
        origine: "EXISTANT_CLIENT",
      },
      {
        investissementId: 7,
        date: "2026-08-12",
        valorisationCentimes: 12_000_00,
        revenuPercuCentimes: 50_00,
      }
    );
    expect(result).toMatchObject({
      ok: true,
      valorisationCentimes: 12_000_00,
      revenuPercuCentimes: null,
    });
  });

  it("valide l'immobilier avec loyer, crédit et fin de prêt", () => {
    const result = validateClientInvestissementUpdate(
      { id: 3, type_produit: "LMNP", origine: "EXISTANT_CLIENT" },
      {
        investissementId: 3,
        date: "2026-08-12",
        valorisationCentimes: 250_000_00,
        loyerMensuelCentimes: 850_00,
        mensualiteCreditCentimes: 1_200_00,
        dateFinPret: "2035-06-01",
      }
    );
    expect(result).toMatchObject({
      ok: true,
      loyerMensuelCentimes: 850_00,
      mensualiteCreditCentimes: 1_200_00,
      clearDateFinPret: false,
    });
    if (typeof result === "object" && result.ok) {
      expect(result.dateFinPretTs).toBeGreaterThan(0);
    }
  });

  it("permet d'effacer la date de fin de prêt", () => {
    const result = validateClientInvestissementUpdate(
      { id: 3, type_produit: "LMNP", origine: "EXISTANT_CLIENT" },
      {
        investissementId: 3,
        date: "2026-08-12",
        valorisationCentimes: 250_000_00,
        dateFinPret: "",
      }
    );
    expect(result).toMatchObject({
      ok: true,
      clearDateFinPret: true,
      dateFinPretTs: null,
    });
  });

  /**
   * Le formulaire pré-remplit loyer et mensualité : un champ vidé signifie
   * « plus de loyer », pas « ne pas toucher ». Sans 0 explicite, le client ne
   * pourrait jamais effacer une valeur.
   */
  it("accepte 0 pour effacer loyer et mensualité", () => {
    const result = validateClientInvestissementUpdate(
      { id: 3, type_produit: "LMNP", origine: "EXISTANT_CLIENT" },
      {
        investissementId: 3,
        date: "2026-08-12",
        valorisationCentimes: 250_000_00,
        loyerMensuelCentimes: 0,
        mensualiteCreditCentimes: 0,
      }
    );
    expect(result).toMatchObject({
      ok: true,
      loyerMensuelCentimes: 0,
      mensualiteCreditCentimes: 0,
    });
  });

  it("plafonne aussi le loyer et la mensualité", () => {
    const base = {
      investissementId: 3,
      date: "2026-08-12",
      valorisationCentimes: 250_000_00,
    };
    expect(
      validateClientInvestissementUpdate(
        { id: 3, type_produit: "LMNP", origine: "EXISTANT_CLIENT" },
        { ...base, loyerMensuelCentimes: PLAFOND_DECLARATION_CENTIMES + 1 }
      )
    ).toBe("loyer_invalide");
    expect(
      validateClientInvestissementUpdate(
        { id: 3, type_produit: "LMNP", origine: "EXISTANT_CLIENT" },
        { ...base, mensualiteCreditCentimes: PLAFOND_DECLARATION_CENTIMES + 1 }
      )
    ).toBe("mensualite_invalide");
  });

  /**
   * Loyer et crédit n'ont pas de sens hors immobilier : envoyés quand même,
   * ils ne doivent pas ressortir de la validation — le portail les ignore de
   * son côté.
   */
  it("ignore loyer et mensualité sur un placement non immobilier", () => {
    const result = validateClientInvestissementUpdate(
      { id: 9, type_produit: "PEA", origine: "EXISTANT_CLIENT" },
      {
        investissementId: 9,
        date: "2026-08-12",
        valorisationCentimes: 10_000_00,
        loyerMensuelCentimes: 800_00,
        mensualiteCreditCentimes: 900_00,
        dateFinPret: "2035-06-01",
      }
    );
    expect(result).toMatchObject({
      ok: true,
      loyerMensuelCentimes: null,
      mensualiteCreditCentimes: null,
      dateFinPretTs: null,
      clearDateFinPret: false,
    });
  });

  it("refuse un montant au-delà du plafond", () => {
    expect(
      validateClientInvestissementUpdate(
        { id: 1, type_produit: "PEA", origine: "EXISTANT_CLIENT" },
        {
          investissementId: 1,
          date: "2026-08-12",
          valorisationCentimes: PLAFOND_DECLARATION_CENTIMES + 1,
        }
      )
    ).toBe("valorisation_invalide");
  });
});
