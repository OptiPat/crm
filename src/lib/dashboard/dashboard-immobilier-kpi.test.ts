import { describe, it, expect } from "vitest";
import {
  filterDashboardImmobilierKpiInvestissements,
  isDashboardImmobilierKpiInvestissement,
} from "./dashboard-immobilier-kpi";
import type { InvestissementWithDetails } from "@/lib/api/tauri-investissements";

function inv(
  partial: Partial<InvestissementWithDetails> & Pick<InvestissementWithDetails, "id">
): InvestissementWithDetails {
  return {
    contact_nom: "DUPONT",
    contact_prenom: "Jean",
    type_produit: "IMMOBILIER",
    nom_produit: "Appartement Lyon",
    origine: "MON_CONSEIL",
    statut: "ACTIF",
    versement_programme: false,
    reinvestissement_dividendes: false,
    created_at: 0,
    updated_at: 0,
    ...partial,
  };
}

describe("dashboard-immobilier-kpi", () => {
  it("inclut immo actif avec moi", () => {
    expect(
      isDashboardImmobilierKpiInvestissement(
        inv({ id: 1, contact_id: 10, type_produit: "PINEL" })
      )
    ).toBe(true);
  });

  it("exclut existant client et cloture", () => {
    expect(
      isDashboardImmobilierKpiInvestissement(
        inv({ id: 2, contact_id: 10, origine: "EXISTANT_CLIENT" })
      )
    ).toBe(false);
    expect(
      isDashboardImmobilierKpiInvestissement(
        inv({ id: 3, contact_id: 10, statut: "CLOTURE" })
      )
    ).toBe(false);
  });

  it("accepte investissement foyer sans contact", () => {
    expect(
      isDashboardImmobilierKpiInvestissement(
        inv({ id: 4, contact_id: undefined, foyer_id: 5, type_produit: "LMNP" })
      )
    ).toBe(true);
  });

  it("accepte alias RP (residence principale legacy)", () => {
    expect(
      isDashboardImmobilierKpiInvestissement(
        inv({ id: 5, contact_id: 10, type_produit: "RP" })
      )
    ).toBe(true);
    expect(
      isDashboardImmobilierKpiInvestissement(
        inv({ id: 6, contact_id: 10, type_produit: "LOCATIF" })
      )
    ).toBe(true);
  });

  it("accepte RS SCI colocation monolocation avec moi", () => {
    for (const type_produit of ["RS", "SCI", "COLOCATION", "MONOLOCATION"] as const) {
      expect(
        isDashboardImmobilierKpiInvestissement(
          inv({ id: 10, contact_id: 10, type_produit })
        )
      ).toBe(true);
      expect(
        isDashboardImmobilierKpiInvestissement(
          inv({ id: 11, contact_id: 10, type_produit, origine: "EXISTANT_CLIENT" })
        )
      ).toBe(false);
    }
  });

  it("filtre la liste", () => {
    const rows = filterDashboardImmobilierKpiInvestissements([
      inv({ id: 1, contact_id: 1 }),
      inv({ id: 2, contact_id: 2, origine: "EXISTANT_CLIENT" }),
      inv({ id: 3, contact_id: 3, type_produit: "ASSURANCE_VIE" }),
    ]);
    expect(rows.map((r) => r.id)).toEqual([1]);
  });
});
