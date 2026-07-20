import { describe, expect, it } from "vitest";
import type { Contact } from "@/lib/api/tauri-contacts";
import {
  computeFilleulAverageVolumeStats,
  computeFilleulClientBridgeStats,
  computeFilleulManagerStats,
  computeFilleulParraineurStats,
  filterContactsForFilleulBridgeList,
  filterContactsForFilleulOrganisationList,
  filterContactsForFilleulParraineurList,
  filterContactsForFilleulVolumeList,
  isContactEligibleForFilleulBridgeBaseStats,
  isFilleulClientBridgeContact,
  isContactEligibleForFilleulOrganisationStats,
  isFilleulManagerInOrganisation,
  isFilleulParrainableDownline,
} from "./contact-filleul-organisation-stats";

function contact(partial: Partial<Contact> & Pick<Contact, "id">): Contact {
  return {
    categorie: "AUCUN",
    nom: "DUPONT",
    prenom: "Jean",
    statut_suivi: "ACTIF",
    created_at: 0,
    updated_at: 0,
    ...partial,
  };
}

describe("contact-filleul-organisation-stats", () => {
  const contacts = [
    contact({
      id: 1,
      filleul_categorie: "FILLEUL",
      parrain_id: 99,
      filleul_titre: "MANAGER",
    }),
    contact({
      id: 2,
      filleul_categorie: "FILLEUL",
      parrain_id: 12,
      filleul_titre: "JUNIOR",
      filleul_qualification: "PLANETE",
    }),
    contact({
      id: 3,
      filleul_categorie: "FILLEUL",
      parrain_id: 12,
      filleul_titre: "CONSULTANT",
    }),
    contact({
      id: 4,
      filleul_categorie: "FILLEUL_DESINSCRIT",
      parrain_id: 12,
      filleul_titre: "SENIOR",
    }),
    contact({
      id: 5,
      filleul_categorie: "PROSPECT_FILLEUL",
      parrain_id: 12,
      filleul_titre: "MANAGER",
    }),
    contact({
      id: 6,
      filleul_categorie: "SUSPECT_FILLEUL",
      parrain_id: 12,
      filleul_titre: "MANAGER",
    }),
  ];

  it("calcule le % de filleuls Manager inscrits tous parrains confondus", () => {
    const stats = computeFilleulManagerStats(contacts);
    expect(stats.totalCount).toBe(3);
    expect(stats.managerCount).toBe(2);
    expect(stats.managerPercent).toBeCloseTo(66.7, 1);
  });

  it("exclut désinscrits, prospects et suspects", () => {
    expect(
      isContactEligibleForFilleulOrganisationStats({
        categorie: "AUCUN",
        filleul_categorie: "FILLEUL_DESINSCRIT",
      })
    ).toBe(false);
    expect(
      isContactEligibleForFilleulOrganisationStats({
        categorie: "AUCUN",
        filleul_categorie: "PROSPECT_FILLEUL",
      })
    ).toBe(false);
    expect(isFilleulManagerInOrganisation({ filleul_titre: "SENIOR" })).toBe(true);
  });

  it("filtre les listes drill-down Manager / autres", () => {
    expect(
      filterContactsForFilleulOrganisationList(contacts, "manager").map((c) => c.id)
    ).toEqual([1, 2]);
    expect(
      filterContactsForFilleulOrganisationList(contacts, "other").map((c) => c.id)
    ).toEqual([3]);
  });

  it("calcule le volume propre moyen de l'exercice", () => {
    const volumeContacts = [
      contact({ id: 1, filleul_categorie: "FILLEUL", filleul_volume: 100_000 }),
      contact({ id: 2, filleul_categorie: "FILLEUL", parrain_id: 99, filleul_volume: 300_000 }),
      contact({ id: 3, filleul_categorie: "FILLEUL", parrain_id: 12 }),
      contact({
        id: 4,
        filleul_categorie: "FILLEUL_DESINSCRIT",
        filleul_volume: 500_000,
      }),
    ];
    const stats = computeFilleulAverageVolumeStats(volumeContacts);
    expect(stats.totalEligible).toBe(3);
    expect(stats.countedCount).toBe(3);
    expect(stats.averageVolume).toBeCloseTo(400_000 / 3, 5);
    expect(stats.missingVolumeCount).toBe(1);
    expect(
      filterContactsForFilleulVolumeList(volumeContacts, "missingVolume").map((c) => c.id)
    ).toEqual([3]);
  });

  it("calcule le taux de parraineurs (filleuls inscrits ayant parrainé au moins 1 filleul)", () => {
    const parrainContacts = [
      contact({ id: 10, filleul_categorie: "FILLEUL", nom: "PARRAIN" }),
      contact({ id: 11, filleul_categorie: "FILLEUL", nom: "NONPARRAIN" }),
      contact({
        id: 20,
        filleul_categorie: "FILLEUL",
        parrain_id: 10,
        nom: "FILLEUL1",
      }),
      contact({
        id: 21,
        filleul_categorie: "FILLEUL_DESINSCRIT",
        parrain_id: 10,
        nom: "FILLEUL2",
      }),
    ];

    const stats = computeFilleulParraineurStats(parrainContacts);
    expect(stats.totalCount).toBe(3);
    expect(stats.parraineurCount).toBe(1);
    expect(stats.parraineurPercent).toBeCloseTo(33.3, 1);
    expect(isFilleulParrainableDownline({ categorie: "AUCUN", filleul_categorie: "FILLEUL_DESINSCRIT" })).toBe(
      true
    );
    expect(
      filterContactsForFilleulParraineurList(parrainContacts, "parraineur").map((c) => c.id)
    ).toEqual([10]);
  });

  it("calcule le pont réseau ↔ patrimoine (filleuls directs inscrits ou désinscrits aussi clients)", () => {
    const SELF_ID = 42;
    const opts = { selfContactId: SELF_ID };
    const bridgeContacts = [
      contact({
        id: 1,
        filleul_categorie: "FILLEUL",
        parrain_id: SELF_ID,
        categorie: "CLIENT",
      }),
      contact({
        id: 2,
        filleul_categorie: "FILLEUL",
        parrain_id: SELF_ID,
        categorie: "PROSPECT_CLIENT",
      }),
      contact({
        id: 3,
        filleul_categorie: "FILLEUL",
        parrain_id: SELF_ID,
        categorie: "AUCUN",
      }),
      contact({
        id: 4,
        filleul_categorie: "FILLEUL",
        parrain_id: 99,
        categorie: "CLIENT",
      }),
      contact({
        id: 5,
        filleul_categorie: "FILLEUL",
        parrain_id: SELF_ID,
        categorie: "CLIENT",
        statut_suivi: "EN_PAUSE",
      }),
      contact({
        id: 6,
        filleul_categorie: "FILLEUL_DESINSCRIT",
        parrain_id: SELF_ID,
        categorie: "CLIENT",
      }),
      contact({
        id: 7,
        filleul_categorie: "FILLEUL_DESINSCRIT",
        parrain_id: SELF_ID,
        categorie: "AUCUN",
      }),
    ];

    const stats = computeFilleulClientBridgeStats(bridgeContacts, opts);
    expect(stats.totalCount).toBe(6);
    expect(stats.bridgeCount).toBe(4);
    expect(stats.bridgePercent).toBeCloseTo(66.666, 1);
    expect(isFilleulClientBridgeContact({ categorie: "CLIENT", statut_suivi: "EN_PAUSE" })).toBe(
      true
    );
    expect(
      filterContactsForFilleulBridgeList(bridgeContacts, "bridge", opts).map((c) => c.id)
    ).toEqual([1, 2, 5, 6]);
    expect(
      isContactEligibleForFilleulBridgeBaseStats(
        { categorie: "AUCUN", filleul_categorie: "FILLEUL", parrain_id: 99 },
        SELF_ID
      )
    ).toBe(false);
    expect(
      isContactEligibleForFilleulBridgeBaseStats(
        { categorie: "AUCUN", filleul_categorie: "FILLEUL_DESINSCRIT", parrain_id: SELF_ID },
        SELF_ID
      )
    ).toBe(true);
  });
});
