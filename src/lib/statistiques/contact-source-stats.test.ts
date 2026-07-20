import { describe, expect, it } from "vitest";
import type { Contact } from "@/lib/api/tauri-contacts";
import type { Investissement } from "@/lib/api/tauri-investissements";
import {
  CONTACT_SOURCE_LEAD_UNSET_KEY,
  computeContactSourceLeadInvestissementStats,
  computeContactSourceLeadStats,
  contactHasSignedAvecMoi,
  contactHasSignedAsFilleulParrain,
  filterContactsBySourceLeadKey,
  filterInvestissementsBySourceLeadKey,
  isContactEligibleForClientSourceLeadStats,
  isContactEligibleForFilleulSourceLeadStats,
  isProspectFilleulForSourceLeadStats,
  resolveSourceLeadAttributionContactId,
} from "./contact-source-stats";

const SELF_ID = 99;

function contact(partial: Partial<Contact> & Pick<Contact, "id">): Contact {
  return {
    categorie: "CLIENT",
    nom: "DUPONT",
    prenom: "Jean",
    statut_suivi: "ACTIF",
    created_at: 0,
    updated_at: 0,
    ...partial,
  };
}

const opts = { selfContactId: SELF_ID };

function inv(partial: Partial<Investissement> & Pick<Investissement, "id">): Investissement {
  return {
    type_produit: "ASSURANCE_VIE",
    nom_produit: "Contrat test",
    versement_programme: false,
    reinvestissement_dividendes: false,
    origine: "MON_CONSEIL",
    created_at: 0,
    updated_at: 0,
    ...partial,
  };
}

describe("contact-source-stats", () => {
  describe("lentille client", () => {
    it("exclut prescripteurs et suspects clients", () => {
      expect(isContactEligibleForClientSourceLeadStats(contact({ id: 1, categorie: "PRESCRIPTEUR" }))).toBe(
        false
      );
      expect(
        isContactEligibleForClientSourceLeadStats(contact({ id: 2, categorie: "SUSPECT_CLIENT" }))
      ).toBe(false);
      expect(isContactEligibleForClientSourceLeadStats(contact({ id: 3, categorie: "CLIENT" }))).toBe(
        true
      );
      expect(
        isContactEligibleForClientSourceLeadStats(contact({ id: 4, categorie: "PROSPECT_CLIENT" }))
      ).toBe(true);
    });

    it("inclut un client aussi prospect filleul (double rôle)", () => {
      const dual = contact({
        id: 10,
        categorie: "PROSPECT_CLIENT",
        filleul_categorie: "PROSPECT_FILLEUL",
        source_lead: "Salon",
      });
      expect(isContactEligibleForClientSourceLeadStats(dual)).toBe(true);
      expect(isContactEligibleForFilleulSourceLeadStats(dual, opts)).toBe(true);
    });

    it("exclut les filleuls seuls", () => {
      expect(
        isContactEligibleForClientSourceLeadStats(
          contact({ id: 1, categorie: "AUCUN", filleul_categorie: "FILLEUL", parrain_id: SELF_ID })
        )
      ).toBe(false);
    });

    it("calcule les pourcentages par source", () => {
      const stats = computeContactSourceLeadStats(
        [
          contact({ id: 1, source_lead: "Recommandation" }),
          contact({ id: 2, source_lead: "Site web" }),
          contact({ id: 3, source_lead: "Recommandation" }),
          contact({ id: 4, source_lead: "" }),
          contact({ id: 5, categorie: "PRESCRIPTEUR" }),
          contact({ id: 6, categorie: "SUSPECT_CLIENT" }),
          contact({ id: 7, categorie: "AUCUN", filleul_categorie: "FILLEUL", parrain_id: SELF_ID }),
        ],
        opts,
        "client"
      );

      expect(stats.total).toBe(4);
      const reco = stats.rows.find((row) => row.label === "Recommandation");
      expect(reco?.count).toBe(2);
      expect(reco?.percent).toBe(50);
    });

    it("fusionne source vide et libellé « Non renseigné »", () => {
      const stats = computeContactSourceLeadStats(
        [
          contact({ id: 1, source_lead: "" }),
          contact({ id: 2, source_lead: "Non renseigné" }),
        ],
        opts,
        "client"
      );

      expect(stats.rows).toHaveLength(1);
      expect(stats.rows[0].key).toBe(CONTACT_SOURCE_LEAD_UNSET_KEY);
      expect(stats.rows[0].count).toBe(2);
    });

    it("fusionne aussi la variante sans accent « non renseigne »", () => {
      const stats = computeContactSourceLeadStats(
        [
          contact({ id: 1, source_lead: "" }),
          contact({ id: 2, source_lead: "non renseigne" }),
        ],
        opts,
        "client"
      );

      expect(stats.rows).toHaveLength(1);
      expect(stats.rows[0].key).toBe(CONTACT_SOURCE_LEAD_UNSET_KEY);
      expect(stats.rows[0].count).toBe(2);
    });
  });

  describe("lentille filleul", () => {
    it("exclut les filleuls hors réseau direct et les suspects filleuls", () => {
      expect(
        isContactEligibleForFilleulSourceLeadStats(
          contact({ id: 1, categorie: "AUCUN", filleul_categorie: "FILLEUL", parrain_id: 12 }),
          opts
        )
      ).toBe(false);
      expect(
        isContactEligibleForFilleulSourceLeadStats(
          contact({ id: 2, categorie: "AUCUN", filleul_categorie: "FILLEUL", parrain_id: SELF_ID }),
          opts
        )
      ).toBe(true);
      expect(
        isContactEligibleForFilleulSourceLeadStats(
          contact({
            id: 3,
            categorie: "AUCUN",
            filleul_categorie: "SUSPECT_FILLEUL",
            parrain_id: SELF_ID,
          }),
          opts
        )
      ).toBe(false);
    });

    it("inclut les prospects filleuls du réseau direct ou sans parrain", () => {
      const prospect = contact({
        id: 10,
        categorie: "AUCUN",
        filleul_categorie: "PROSPECT_FILLEUL",
        parrain_id: SELF_ID,
        source_lead: "Club entrepreneurs",
      });
      expect(isProspectFilleulForSourceLeadStats(prospect, SELF_ID)).toBe(true);
      expect(isContactEligibleForFilleulSourceLeadStats(prospect, opts)).toBe(true);

      const sansParrain = contact({
        id: 11,
        categorie: "AUCUN",
        filleul_categorie: "PROSPECT_FILLEUL",
        source_lead: "Salon",
      });
      expect(isContactEligibleForFilleulSourceLeadStats(sansParrain, opts)).toBe(true);
    });

    it("exclut un prospect filleul rattaché à un autre parrain", () => {
      expect(
        isContactEligibleForFilleulSourceLeadStats(
          contact({
            id: 10,
            categorie: "AUCUN",
            filleul_categorie: "PROSPECT_FILLEUL",
            parrain_id: 12,
            source_lead: "Salon",
          }),
          opts
        )
      ).toBe(false);
    });

    it("agrège prospects et inscrits par source", () => {
      const stats = computeContactSourceLeadStats(
        [
          contact({
            id: 10,
            categorie: "AUCUN",
            filleul_categorie: "PROSPECT_FILLEUL",
            parrain_id: SELF_ID,
            source_lead: "Club entrepreneurs",
          }),
          contact({
            id: 11,
            categorie: "AUCUN",
            filleul_categorie: "FILLEUL",
            parrain_id: SELF_ID,
            source_lead: "Club entrepreneurs",
          }),
        ],
        opts,
        "filleul"
      );
      expect(stats.total).toBe(2);
      expect(stats.rows[0]?.label).toBe("Club entrepreneurs");
      expect(stats.rows[0]?.count).toBe(2);
    });
  });

  describe("conversion client", () => {
    it("agrège les investissements avec moi par source", () => {
      const contacts = [
        contact({ id: 1, source_lead: "Recommandation" }),
        contact({ id: 2, source_lead: "Site web" }),
        contact({ id: 3, source_lead: "Recommandation" }),
      ];
      const investissements = [
        inv({ id: 10, contact_id: 1, montant_initial: 100_000 }),
        inv({ id: 11, contact_id: 1, montant_initial: 50_000 }),
        inv({ id: 12, contact_id: 2, montant_initial: 200_000 }),
        inv({ id: 13, contact_id: 3, montant_initial: 75_000, origine: "EXISTANT_CLIENT" }),
      ];

      const stats = computeContactSourceLeadInvestissementStats(
        contacts,
        investissements,
        opts,
        "client"
      );
      expect(stats.total).toBe(3);
      expect(stats.totalMontantCentimes).toBe(350_000);

      const reco = stats.rows.find((row) => row.label === "Recommandation");
      expect(reco?.count).toBe(2);
      expect(reco?.contactCount).toBe(2);
      expect(reco?.signedContactCount).toBe(1);
      expect(reco?.conversionPercent).toBe(50);
      expect(reco?.montantCentimes).toBe(150_000);
    });

    it("ne compte pas un filleul inscrit comme signé client", () => {
      const contacts = [
        contact({ id: 1, source_lead: "Recommandation", categorie: "CLIENT" }),
        contact({
          id: 2,
          source_lead: "Recommandation",
          categorie: "AUCUN",
          filleul_categorie: "FILLEUL",
          parrain_id: SELF_ID,
        }),
      ];
      const stats = computeContactSourceLeadInvestissementStats(contacts, [], opts, "client");
      const reco = stats.rows.find((row) => row.label === "Recommandation");
      expect(reco?.contactCount).toBe(1);
      expect(reco?.signedContactCount).toBe(0);
    });

    it("trie les sources par montant signé décroissant", () => {
      const contacts = [
        contact({ id: 1, source_lead: "Salon" }),
        contact({ id: 2, source_lead: "Site web" }),
        contact({ id: 3, source_lead: "Recommandation" }),
      ];
      const investissements = [
        inv({ id: 10, contact_id: 1, montant_initial: 50_000 }),
        inv({ id: 11, contact_id: 2, montant_initial: 200_000 }),
        inv({ id: 12, contact_id: 3, montant_initial: 100_000 }),
      ];

      const stats = computeContactSourceLeadInvestissementStats(
        contacts,
        investissements,
        opts,
        "client"
      );
      expect(stats.rows.map((row) => row.label)).toEqual([
        "Site web",
        "Recommandation",
        "Salon",
      ]);
    });

    it("calcule le taux de conversion partiel", () => {
      const contacts = Array.from({ length: 20 }, (_, index) =>
        contact({ id: index + 1, source_lead: "Club entrepreneurs" })
      );
      const investissements = [1, 2, 3, 4, 5].map((id) => inv({ id: 100 + id, contact_id: id }));

      const stats = computeContactSourceLeadInvestissementStats(
        contacts,
        investissements,
        opts,
        "client"
      );
      const club = stats.rows.find((row) => row.label === "Club entrepreneurs");
      expect(club?.contactCount).toBe(20);
      expect(club?.signedContactCount).toBe(5);
      expect(club?.conversionPercent).toBe(25);
    });
  });

  describe("conversion filleul", () => {
    it("compte un filleul inscrit sans investissement comme signé", () => {
      const contacts = [
        contact({
          id: 1,
          source_lead: "Recommandation",
          categorie: "AUCUN",
          filleul_categorie: "PROSPECT_FILLEUL",
          parrain_id: SELF_ID,
        }),
        contact({
          id: 2,
          source_lead: "Recommandation",
          categorie: "AUCUN",
          filleul_categorie: "FILLEUL",
          parrain_id: SELF_ID,
        }),
        contact({
          id: 3,
          source_lead: "Recommandation",
          categorie: "AUCUN",
          filleul_categorie: "FILLEUL",
          parrain_id: 12,
        }),
      ];
      const investissements = [inv({ id: 10, contact_id: 2 })];

      expect(contactHasSignedAsFilleulParrain(contacts[1]!, SELF_ID)).toBe(true);
      expect(contactHasSignedAsFilleulParrain(contacts[0]!, SELF_ID)).toBe(false);

      const stats = computeContactSourceLeadInvestissementStats(
        contacts,
        investissements,
        opts,
        "filleul"
      );
      const reco = stats.rows.find((row) => row.label === "Recommandation");
      expect(reco?.contactCount).toBe(2);
      expect(reco?.signedContactCount).toBe(1);
      expect(reco?.conversionPercent).toBe(50);
      expect(reco?.count).toBe(0);
      expect(reco?.montantCentimes).toBe(0);
    });

    it("compte un filleul désinscrit comme signé", () => {
      const contacts = [
        contact({
          id: 1,
          source_lead: "Salon",
          categorie: "AUCUN",
          filleul_categorie: "PROSPECT_FILLEUL",
          parrain_id: SELF_ID,
        }),
        contact({
          id: 2,
          source_lead: "Salon",
          categorie: "AUCUN",
          filleul_categorie: "FILLEUL_DESINSCRIT",
          parrain_id: SELF_ID,
        }),
      ];

      const stats = computeContactSourceLeadInvestissementStats(contacts, [], opts, "filleul");
      expect(stats.rows[0]?.signedContactCount).toBe(1);
      expect(stats.rows[0]?.conversionPercent).toBe(50);
    });

    it("trie par taux de conversion décroissant", () => {
      const contacts = [
        contact({
          id: 1,
          source_lead: "Salon",
          categorie: "AUCUN",
          filleul_categorie: "PROSPECT_FILLEUL",
          parrain_id: SELF_ID,
        }),
        contact({
          id: 2,
          source_lead: "Salon",
          categorie: "AUCUN",
          filleul_categorie: "FILLEUL",
          parrain_id: SELF_ID,
        }),
        contact({
          id: 3,
          source_lead: "Site web",
          categorie: "AUCUN",
          filleul_categorie: "PROSPECT_FILLEUL",
          parrain_id: SELF_ID,
        }),
        contact({
          id: 4,
          source_lead: "Site web",
          categorie: "AUCUN",
          filleul_categorie: "PROSPECT_FILLEUL",
          parrain_id: SELF_ID,
        }),
      ];

      const stats = computeContactSourceLeadInvestissementStats(contacts, [], opts, "filleul");
      expect(stats.rows.map((row) => row.label)).toEqual(["Salon", "Site web"]);
      expect(stats.rows[0]?.conversionPercent).toBe(50);
      expect(stats.rows[1]?.conversionPercent).toBe(0);
    });
  });

  it("regroupe les sources sans tenir compte de la casse", () => {
    const stats = computeContactSourceLeadStats(
      [
        contact({ id: 1, source_lead: "Recommandation" }),
        contact({ id: 2, source_lead: "recommandation" }),
      ],
      opts,
      "client"
    );

    expect(stats.total).toBe(2);
    expect(stats.rows).toHaveLength(1);
    expect(stats.rows[0]?.count).toBe(2);
  });

  it("filtre les contacts par clé de source (lentille)", () => {
    const contacts = [
      contact({ id: 1, source_lead: "Salon" }),
      contact({ id: 2, source_lead: "Site web" }),
      contact({ id: 3 }),
      contact({
        id: 4,
        categorie: "AUCUN",
        filleul_categorie: "FILLEUL",
        parrain_id: SELF_ID,
        source_lead: "Salon",
      }),
    ];
    const salonKey = statsKey(contacts, "Salon", "client");
    expect(filterContactsBySourceLeadKey(contacts, salonKey, opts, "client").map((c) => c.id)).toEqual(
      [1]
    );
    expect(
      filterContactsBySourceLeadKey(contacts, salonKey, opts, "filleul").map((c) => c.id)
    ).toEqual([4]);
    expect(
      filterContactsBySourceLeadKey(contacts, CONTACT_SOURCE_LEAD_UNSET_KEY, opts, "client").map(
        (c) => c.id
      )
    ).toEqual([3]);
  });

  it("compte signé via un placement foyer commun", () => {
    const contacts = [
      contact({ id: 1, source_lead: "Recommandation", foyer_id: 5 }),
      contact({ id: 2, source_lead: "Recommandation", foyer_id: 5 }),
    ];
    expect(contactHasSignedAvecMoi(contacts[1]!, [inv({ id: 20, foyer_id: 5 })])).toBe(true);
  });

  it("attribue un investissement foyer au premier contact éligible client", () => {
    const contacts = [
      contact({ id: 1, source_lead: "Salon", foyer_id: 5 }),
      contact({ id: 2, source_lead: "Site web", foyer_id: 5 }),
    ];
    const investment = inv({ id: 20, foyer_id: 5, montant_initial: 10_000 });
    expect(resolveSourceLeadAttributionContactId(investment, contacts, opts)).toBe(1);

    const stats = computeContactSourceLeadInvestissementStats(
      contacts,
      [investment],
      opts,
      "client"
    );
    const salon = stats.rows.find((row) => row.label === "Salon");
    expect(salon?.count).toBe(1);
    expect(salon?.signedContactCount).toBe(1);
    expect(salon?.conversionPercent).toBe(100);
  });

  it("filtre les investissements par clé de source", () => {
    const contacts = [
      contact({ id: 1, source_lead: "Salon" }),
      contact({ id: 2, source_lead: "Site web" }),
    ];
    const investissements = [inv({ id: 10, contact_id: 1 }), inv({ id: 11, contact_id: 2 })];
    const salonKey = statsKey(contacts, "Salon", "client");
    expect(
      filterInvestissementsBySourceLeadKey(contacts, investissements, salonKey, opts).map(
        (item) => item.id
      )
    ).toEqual([10]);
  });
});

function statsKey(
  contacts: Contact[],
  label: string,
  lens: "client" | "filleul" = "client"
): string {
  const stats = computeContactSourceLeadStats(contacts, opts, lens);
  const row = stats.rows.find((item) => item.label === label);
  if (!row) throw new Error(`missing row ${label}`);
  return row.key;
}
