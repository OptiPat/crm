import { describe, it, expect } from "vitest";
import {
  filterDashboardVersementProgrammeKpiInvestissements,
  listDashboardVersementProgrammeKpiInvestissements,
} from "./dashboard-versements-kpi";
import type { InvestissementWithDetails } from "@/lib/api/tauri-investissements";

function inv(
  partial: Partial<InvestissementWithDetails> & Pick<InvestissementWithDetails, "id">
): InvestissementWithDetails {
  return {
    contact_nom: "DUPONT",
    contact_prenom: "Jean",
    type_produit: "ASSURANCE_VIE",
    nom_produit: "Contrat AV",
    origine: "MON_CONSEIL",
    statut: "ACTIF",
    versement_programme: true,
    montant_versement_programme: 10_000,
    frequence_versement: "MENSUEL",
    reinvestissement_dividendes: false,
    created_at: 0,
    updated_at: 0,
    ...partial,
  };
}

describe("dashboard-versements-kpi", () => {
  it("inclut VP actif avec moi", () => {
    expect(
      filterDashboardVersementProgrammeKpiInvestissements([
        inv({ id: 1, contact_id: 1 }),
      ])
    ).toHaveLength(1);
  });

  it("exclut sans VP ou existant client", () => {
    expect(
      filterDashboardVersementProgrammeKpiInvestissements([
        inv({ id: 1, contact_id: 1, versement_programme: false }),
        inv({ id: 2, contact_id: 2, origine: "EXISTANT_CLIENT" }),
      ])
    ).toHaveLength(0);
  });

  it("trie par montant annuel decroissant", () => {
    const rows = listDashboardVersementProgrammeKpiInvestissements([
      inv({ id: 1, contact_id: 1, montant_versement_programme: 5_000, frequence_versement: "ANNUEL" }),
      inv({ id: 2, contact_id: 2, montant_versement_programme: 1_000, frequence_versement: "MENSUEL" }),
    ]);
    expect(rows.map((r) => r.id)).toEqual([2, 1]);
  });
});
