import { describe, expect, it } from "vitest";
import {
  buildClientInvestissementUpdateInput,
  getClientInvestissementUpdateKind,
  isClientInvestissementUpdateEligible,
  unixToDateInput,
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

  /**
   * Le défaut visé : le formulaire pré-remplit la fin de prêt, et la renvoyait
   * telle quelle. Si le conseiller la saisit pendant que le client a l'écran
   * ouvert, cette réaffirmation d'une valeur périmée l'effaçait à l'import.
   */
  describe("buildClientInvestissementUpdateInput", () => {
    const immo = {
      id: 3,
      type_produit: "LMNP",
      origine: "EXISTANT_CLIENT" as const,
      loyer_mensuel: 850_00,
      mensualite_credit: 1_200_00,
      date_fin_pret: undefined as number | undefined,
    };
    const champs = {
      date: "2026-08-12",
      valorisation: "250 000,00",
      revenu: "",
      loyer: "850,00",
      mensualite: "1200",
      dateFinPret: "",
    };

    it("n'envoie pas les champs immobiliers laissés tels quels", () => {
      const input = buildClientInvestissementUpdateInput(immo, champs);
      expect(input.valorisationCentimes).toBe(250_000_00);
      expect("loyerMensuelCentimes" in input).toBe(false);
      expect("mensualiteCreditCentimes" in input).toBe(false);
      expect("dateFinPret" in input).toBe(false);
    });

    it("envoie 0 quand le client vide volontairement un montant", () => {
      const input = buildClientInvestissementUpdateInput(immo, {
        ...champs,
        loyer: "",
      });
      expect(input.loyerMensuelCentimes).toBe(0);
      expect("mensualiteCreditCentimes" in input).toBe(false);
    });

    it("envoie la fin de prêt seulement si elle change", () => {
      const avecPret = { ...immo, date_fin_pret: 2_066_688_000 };
      const dateAffichee = unixToDateInput(avecPret.date_fin_pret);

      expect(
        "dateFinPret" in
          buildClientInvestissementUpdateInput(avecPret, {
            ...champs,
            dateFinPret: dateAffichee,
          })
      ).toBe(false);

      // Champ vidé : effacement demandé, la chaîne vide part.
      expect(
        buildClientInvestissementUpdateInput(avecPret, {
          ...champs,
          dateFinPret: "",
        }).dateFinPret
      ).toBe("");

      expect(
        buildClientInvestissementUpdateInput(avecPret, {
          ...champs,
          dateFinPret: "2040-01-31",
        }).dateFinPret
      ).toBe("2040-01-31");
    });

    it("ignore une réécriture qui ne change pas le montant", () => {
      const input = buildClientInvestissementUpdateInput(immo, {
        ...champs,
        loyer: "850",
        mensualite: "1 200,00",
      });
      expect("loyerMensuelCentimes" in input).toBe(false);
      expect("mensualiteCreditCentimes" in input).toBe(false);
    });

    it("ne propose loyer et fin de prêt que sur l'immobilier", () => {
      const input = buildClientInvestissementUpdateInput(
        { ...immo, type_produit: "PEA" },
        { ...champs, loyer: "999", dateFinPret: "2040-01-31" }
      );
      expect("loyerMensuelCentimes" in input).toBe(false);
      expect("dateFinPret" in input).toBe(false);
      expect("revenuPercuCentimes" in input).toBe(false);
    });

    it("transmet le revenu SCPI, y compris vidé", () => {
      const scpi = {
        ...immo,
        type_produit: "SCPI",
        origine: "MON_CONSEIL" as const,
      };
      expect(
        buildClientInvestissementUpdateInput(scpi, { ...champs, revenu: "300" })
          .revenuPercuCentimes
      ).toBe(300_00);
      expect(
        buildClientInvestissementUpdateInput(scpi, champs).revenuPercuCentimes
      ).toBeNull();
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
