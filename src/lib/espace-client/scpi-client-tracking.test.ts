import { describe, expect, it } from "vitest";
import {
  defaultValorisationCentimes,
  isScpiClientTrackingEligible,
  validateScpiClientDeclaration,
  PLAFOND_DECLARATION_CENTIMES,
} from "./scpi-client-tracking";

describe("scpi-client-tracking", () => {
  const inv = {
    id: 42,
    type_produit: "SCPI",
    origine: "MON_CONSEIL" as const,
    encours_actuel: 3_000_000,
    montant_initial: 2_500_000,
  };

  it("accepte SCPI, SCPI_FISCALE et démembrement (avec moi ou à côté)", () => {
    expect(isScpiClientTrackingEligible(inv)).toBe(true);
    expect(
      isScpiClientTrackingEligible({ ...inv, type_produit: "SCPI_FISCALE" })
    ).toBe(true);
    expect(
      isScpiClientTrackingEligible({ ...inv, type_produit: "SCPI_DEMEMBREMENT" })
    ).toBe(true);
    expect(
      isScpiClientTrackingEligible({ ...inv, origine: "EXISTANT_CLIENT" })
    ).toBe(true);
    expect(
      isScpiClientTrackingEligible({ ...inv, type_produit: "ASSURANCE_VIE" })
    ).toBe(false);
  });

  it("valide une déclaration avec revenu optionnel", () => {
    const result = validateScpiClientDeclaration(inv, {
      investissementId: 42,
      date: "2026-08-12",
      valorisationCentimes: 3_000_000,
      revenuPercuCentimes: 30_000,
    });
    expect(result).toMatchObject({
      ok: true,
      valorisationCentimes: 3_000_000,
      revenuPercuCentimes: 30_000,
    });
  });

  it("refuse une date future", () => {
    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);
    const y = future.getFullYear();
    const m = String(future.getMonth() + 1).padStart(2, "0");
    const d = String(future.getDate()).padStart(2, "0");
    expect(
      validateScpiClientDeclaration(inv, {
        investissementId: 42,
        date: `${y}-${m}-${d}`,
        valorisationCentimes: 1,
      })
    ).toBe("date_future");
  });

  /**
   * Une faute de frappe passerait sinon jusqu'à l'historique de valorisations
   * du conseiller, sous forme de montant absurde.
   */
  it("refuse un montant au-delà de dix millions d'euros", () => {
    expect(
      validateScpiClientDeclaration(inv, {
        investissementId: 42,
        date: "2026-08-12",
        valorisationCentimes: PLAFOND_DECLARATION_CENTIMES + 100,
      })
    ).toBe("valorisation_invalide");

    expect(
      validateScpiClientDeclaration(inv, {
        investissementId: 42,
        date: "2026-08-12",
        valorisationCentimes: 3_000_000,
        revenuPercuCentimes: PLAFOND_DECLARATION_CENTIMES + 100,
      })
    ).toBe("revenu_invalide");

    expect(
      validateScpiClientDeclaration(inv, {
        investissementId: 42,
        date: "2026-08-12",
        valorisationCentimes: PLAFOND_DECLARATION_CENTIMES,
      })
    ).toMatchObject({ ok: true });
  });

  it("pré-remplit depuis l'historique puis l'encours", () => {
    expect(
      defaultValorisationCentimes(inv, [
        { dateTs: 100, montantCentimes: 2_800_000 },
        { dateTs: 200, montantCentimes: 2_900_000 },
      ])
    ).toBe(2_900_000);
    expect(defaultValorisationCentimes(inv)).toBe(3_000_000);
  });
});
