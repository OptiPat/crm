import { describe, expect, it } from "vitest";
import {
  INVESTISSEMENTS_CSV_HEADERS,
  investissementToCsvRow,
} from "./investissements-portfolio-export";
import type { InvestissementWithDetails } from "@/lib/api/tauri-investissements";

function baseInv(
  overrides: Partial<InvestissementWithDetails> = {}
): InvestissementWithDetails {
  return {
    id: 1,
    contact_id: 10,
    contact_nom: "DUPONT",
    contact_prenom: "Jean",
    type_produit: "ASSURANCE_VIE",
    nom_produit: "Contrat AV",
    montant_initial: 100000,
    encours_actuel: 120000,
    versement_programme: true,
    montant_versement_programme: 5000,
    frequence_versement: "MENSUEL",
    reinvestissement_dividendes: false,
    origine: "MON_CONSEIL",
    created_at: 0,
    updated_at: 0,
    ...overrides,
  };
}

describe("investissements-portfolio-export", () => {
  it("exporte encours et VP", () => {
    const row = investissementToCsvRow(baseInv());
    expect(INVESTISSEMENTS_CSV_HEADERS).toHaveLength(row.length);
    expect(row[2]).toBe("1000.00");
    expect(row[3]).toBe("1200.00");
    expect(row[4]).toBe("Oui");
    expect(row[5]).toBe("50.00");
    expect(row[6]).toBe("MENSUEL");
  });

  it("SCPI crédit et sans encours pour immo", () => {
    const row = investissementToCsvRow(
      baseInv({
        type_produit: "SCPI",
        encours_actuel: undefined,
        versement_programme: false,
        montant_versement_programme: undefined,
        credit_crd: 250000,
      })
    );
    expect(row[3]).toBe("");
    expect(row[4]).toBe("Non");
    expect(row[16]).toBe("Oui");
  });
});
