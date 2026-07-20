import { describe, expect, it } from "vitest";
import type { Contact } from "@/lib/api/tauri-contacts";
import type { Investissement } from "@/lib/api/tauri-investissements";
import {
  computeClientProductCoverageStats,
  contactHasProductCoverage,
  filterContactsForClientProductCoverageList,
  getClientProductCoverageConfig,
  isContactEligibleForClientProductCoverageStats,
} from "./contact-client-product-coverage-stats";

function contact(overrides: Partial<Contact> & Pick<Contact, "id">): Contact {
  return {
    nom: "DUPONT",
    prenom: "Jean",
    categorie: "CLIENT",
    ...overrides,
  } as Contact;
}

function inv(overrides: Partial<Investissement>): Investissement {
  return {
    id: 1,
    type_produit: "ASSURANCE_VIE",
    nom_produit: "Contrat",
    versement_programme: false,
    reinvestissement_dividendes: false,
    origine: "MON_CONSEIL",
    created_at: 0,
    updated_at: 0,
    ...overrides,
  } as Investissement;
}

describe("contact-client-product-coverage-stats", () => {
  it("exclut anciens clients, prospects et suspects", () => {
    expect(
      isContactEligibleForClientProductCoverageStats({
        categorie: "CLIENT",
        statut_suivi: "EN_PAUSE",
      })
    ).toBe(false);
    expect(isContactEligibleForClientProductCoverageStats({ categorie: "PROSPECT_CLIENT" })).toBe(
      false
    );
    expect(isContactEligibleForClientProductCoverageStats({ categorie: "CLIENT", statut_suivi: "ACTIF" })).toBe(
      true
    );
  });

  it("calcule le % clients actifs avec assurance-vie « avec moi »", () => {
    const config = getClientProductCoverageConfig("assurance_vie");
    const contacts = [
      contact({ id: 1 }),
      contact({ id: 2, foyer_id: 20 }),
      contact({ id: 3 }),
    ];
    const investissements = [
      inv({ id: 1, contact_id: 1, type_produit: "ASSURANCE_VIE" }),
      inv({ id: 2, foyer_id: 20, type_produit: "ASSURANCE_VIE" }),
      inv({ id: 3, contact_id: 3, type_produit: "ASSURANCE_VIE", origine: "EXISTANT_CLIENT" }),
    ];

    const stats = computeClientProductCoverageStats(contacts, investissements, config);
    expect(stats.totalCount).toBe(3);
    expect(stats.withProductCount).toBe(2);
    expect(
      filterContactsForClientProductCoverageList(contacts, "withProduct", investissements, config).map(
        (c) => c.id
      )
    ).toEqual([1, 2]);
  });

  it("couvre SCPI, PER et immobilier « avec moi »", () => {
    const contacts = [contact({ id: 1 }), contact({ id: 2 }), contact({ id: 3 }), contact({ id: 4 })];
    const investissements = [
      inv({ id: 1, contact_id: 1, type_produit: "SCPI_DEMEMBREMENT" }),
      inv({ id: 2, contact_id: 2, type_produit: "PER" }),
      inv({ id: 3, contact_id: 3, type_produit: "PINEL" }),
      inv({ id: 4, contact_id: 4, type_produit: "SCPI", origine: "EXISTANT_CLIENT" }),
    ];

    expect(
      contactHasProductCoverage(
        contacts[0]!,
        investissements,
        getClientProductCoverageConfig("scpi")
      )
    ).toBe(true);
    expect(
      contactHasProductCoverage(
        contacts[1]!,
        investissements,
        getClientProductCoverageConfig("per")
      )
    ).toBe(true);
    expect(
      contactHasProductCoverage(
        contacts[2]!,
        investissements,
        getClientProductCoverageConfig("immobilier")
      )
    ).toBe(true);
    expect(
      contactHasProductCoverage(
        contacts[3]!,
        investissements,
        getClientProductCoverageConfig("scpi")
      )
    ).toBe(false);
  });
});
