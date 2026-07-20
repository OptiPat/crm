import { describe, expect, it } from "vitest";
import type { Contact } from "@/lib/api/tauri-contacts";
import type { Investissement } from "@/lib/api/tauri-investissements";
import {
  buildActiveClientCountByFoyer,
  buildActiveClientIdSet,
  buildInvestissementIndexes,
  computeClientAbovePanierMoyenStats,
  contactMontantSouscritAvecMoiEuros,
  filterContactsForClientAbovePanierMoyenList,
} from "./contact-client-panier-moyen-stats";

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

describe("contact-client-panier-moyen-stats", () => {
  it("compare le montant souscrit perso au panier moyen global", () => {
    const contacts = [
      contact({ id: 1 }),
      contact({ id: 2 }),
      contact({ id: 3, statut_suivi: "EN_PAUSE" }),
    ];
    const investissements = [
      inv({ id: 1, contact_id: 1, montant_initial: 2_000_000 }),
      inv({ id: 2, contact_id: 2, montant_initial: 500_000 }),
      inv({ id: 3, contact_id: 3, montant_initial: 9_000_000 }),
    ];
    const indexes = buildInvestissementIndexes(investissements);
    const activeClientCountByFoyer = buildActiveClientCountByFoyer(contacts);
    const activeClientIds = buildActiveClientIdSet(contacts);

    expect(
      contactMontantSouscritAvecMoiEuros(
        contacts[0]!,
        indexes,
        activeClientCountByFoyer,
        activeClientIds
      )
    ).toBe(20_000);
    expect(
      contactMontantSouscritAvecMoiEuros(
        contacts[1]!,
        indexes,
        activeClientCountByFoyer,
        activeClientIds
      )
    ).toBe(5_000);

    const panierMoyen = 12_500;
    const stats = computeClientAbovePanierMoyenStats(contacts, investissements, panierMoyen);
    expect(stats.totalCount).toBe(2);
    expect(stats.aboveCount).toBe(1);
    expect(
      filterContactsForClientAbovePanierMoyenList(contacts, "above", investissements, panierMoyen).map(
        (c) => c.id
      )
    ).toEqual([1]);
  });

  it("répartit le commun foyer entre clients actifs du foyer", () => {
    const contacts = [contact({ id: 1, foyer_id: 10 }), contact({ id: 2, foyer_id: 10 })];
    const investissements = [inv({ id: 1, foyer_id: 10, montant_initial: 10_000_000 })];
    const indexes = buildInvestissementIndexes(investissements);
    const activeClientCountByFoyer = buildActiveClientCountByFoyer(contacts);
    const activeClientIds = buildActiveClientIdSet(contacts);

    expect(
      contactMontantSouscritAvecMoiEuros(
        contacts[0]!,
        indexes,
        activeClientCountByFoyer,
        activeClientIds
      )
    ).toBe(50_000);
    expect(
      contactMontantSouscritAvecMoiEuros(
        contacts[1]!,
        indexes,
        activeClientCountByFoyer,
        activeClientIds
      )
    ).toBe(50_000);
  });

  it("répartit les placements foyer rattachés à un déclarant entre conjoints", () => {
    const contacts = [contact({ id: 1, foyer_id: 10 }), contact({ id: 2, foyer_id: 10 })];
    const investissements = [
      inv({
        id: 1,
        contact_id: 1,
        foyer_id: 10,
        type_produit: "PINEL",
        montant_initial: 21_500_000,
      }),
    ];
    const indexes = buildInvestissementIndexes(investissements);
    const activeClientCountByFoyer = buildActiveClientCountByFoyer(contacts);
    const activeClientIds = buildActiveClientIdSet(contacts);

    expect(
      contactMontantSouscritAvecMoiEuros(
        contacts[0]!,
        indexes,
        activeClientCountByFoyer,
        activeClientIds
      )
    ).toBe(107_500);
    expect(
      contactMontantSouscritAvecMoiEuros(
        contacts[1]!,
        indexes,
        activeClientCountByFoyer,
        activeClientIds
      )
    ).toBe(107_500);

    const stats = computeClientAbovePanierMoyenStats(contacts, investissements, 55_000);
    expect(stats.aboveCount).toBe(2);
  });

  it("ignore le pool foyer des placements rattachés à un ancien client", () => {
    const contacts = [
      contact({ id: 1, foyer_id: 10 }),
      contact({ id: 2, foyer_id: 10, statut_suivi: "EN_PAUSE" }),
    ];
    const investissements = [
      inv({ id: 1, contact_id: 2, foyer_id: 10, montant_initial: 10_000_000 }),
      inv({ id: 2, foyer_id: 10, montant_initial: 4_000_000 }),
    ];
    const indexes = buildInvestissementIndexes(investissements);
    const activeClientCountByFoyer = buildActiveClientCountByFoyer(contacts);
    const activeClientIds = buildActiveClientIdSet(contacts);

    expect(
      contactMontantSouscritAvecMoiEuros(
        contacts[0]!,
        indexes,
        activeClientCountByFoyer,
        activeClientIds
      )
    ).toBe(40_000);
  });
});
