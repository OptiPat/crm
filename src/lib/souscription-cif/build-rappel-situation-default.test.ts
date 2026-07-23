import { describe, expect, it } from "vitest";
import {
  buildDefaultRappelSituation,
  buildRappelSituationSupplement,
  latestQpiAppetencesEsg,
  migrateRappelSituationPanelLabels,
  normalizeRappelSituationClient,
  syncRappelSituationFromContact,
} from "@/lib/souscription-cif/build-rappel-situation-default";
import {
  RM_HINT_IMMOBILIER_BULLET_LABEL,
  RM_PANEL_IMMOBILIER_BULLET_LABEL,
  RM_PANEL_EPARGNE_BULLET_LABEL,
  RM_PANEL_REVENUS_BULLET_LABEL,
  RM_PANEL_VALEURS_MOBILIERES_BULLET_LABEL,
} from "@/lib/souscription-cif/rapport-mission-recap-table";
import type { Contact } from "@/lib/api/tauri-contacts";
import type { Document } from "@/lib/api/tauri-documents";
import type { Investissement } from "@/lib/api/tauri-investissements";
import type { Foyer } from "@/lib/api/tauri-foyers";
import { countEnfantsFoyer } from "@/lib/foyers/foyer-utils";

const baseInvestissement = (overrides: Partial<Investissement>): Investissement =>
  ({
    id: 1,
    contact_id: 1,
    type_produit: "SCPI",
    nom_produit: "Comète",
    montant_initial: 80_000_00,
    origine: "EXISTANT_CLIENT",
    versement_programme: false,
    reinvestissement_dividendes: false,
    created_at: 0,
    updated_at: 0,
    ...overrides,
  }) as Investissement;

const baseContact: Contact = {
  id: 1,
  categorie: "CLIENT",
  nom: "BERNARD",
  prenom: "Luc",
  statut_suivi: "ACTIF",
  situation_familiale: "MARIE",
  profil_risque_sri: 4,
  date_naissance: Math.floor(new Date("1980-06-15").getTime() / 1000),
  created_at: 0,
  updated_at: 0,
};

describe("buildDefaultRappelSituation", () => {
  it("préremplit age, situation, SRI et données foyer", () => {
    const contact: Contact = {
      ...baseContact,
      revenus_annuels: 85_000,
      epargne_precaution_souhaitee: 15_000,
    };
    const foyer: Foyer = {
      id: 1,
      nom: "BERNARD",
      type_foyer: "COUPLE",
      revenu_fiscal_reference: 85000,
      ir_net_a_payer: 12_500,
      tranche_imposition: "30%",
      nombre_parts_fiscales: 2.5,
      situation_patrimoniale: "RP + locatif",
      created_at: 0,
      updated_at: 0,
    };

    const text = buildDefaultRappelSituation(contact, foyer);
    expect(text).toContain("➞ Âge :");
    expect(text).toContain("➞ Nombre d'enfants : 0");
    expect(text).toContain(`➞ ${RM_PANEL_REVENUS_BULLET_LABEL} :`);
    expect(text).toContain("85");
    expect(text).not.toContain("RBG");
    expect(text).toContain("TMI : 30%");
    expect(text).toContain("IR 12");
    expect(text).toContain(`➞ ${RM_PANEL_IMMOBILIER_BULLET_LABEL} :`);
    expect(text).toContain(`➞ ${RM_PANEL_EPARGNE_BULLET_LABEL} : 15`);
    expect(text).toContain("➞ Endettement :");
    expect(text).toContain("Marié(e)");
    expect(text).toContain("Profil de risque investisseur (SRI + définition)");
    expect(text).toContain("SRI 4/5 — Dynamique");
    expect(text).toContain("marchés volatils");
    expect(text).toContain("RP + locatif");
  });

  it("raccourcit les libellés panneau pour le rendu rapport", () => {
    const panel = buildDefaultRappelSituation(baseContact, null);
    const rapport = normalizeRappelSituationClient(panel);

    expect(panel).toContain(RM_PANEL_REVENUS_BULLET_LABEL);
    expect(panel).toContain(RM_PANEL_IMMOBILIER_BULLET_LABEL);
    expect(panel).toContain("Profil de risque investisseur (SRI + définition)");

    expect(rapport).toContain("➞ Revenus :");
    expect(rapport).toContain("➞ Immobilier :");
    expect(rapport).toContain("➞ Valeurs mobilières :");
    expect(rapport).not.toContain("détention court, moyen ou long terme");
    expect(rapport).toContain("➞ Épargne de précaution :");
    expect(rapport).toContain("➞ Endettement :");
    expect(rapport).toContain("➞ Montant de l'investissement envisagé :");
    expect(rapport).toContain("➞ Appétences ESG :");
    expect(rapport).toContain("➞ Profil de risque investisseur : SRI 4/5 — Dynamique");
    expect(rapport).not.toContain("Imposition ; Nombre de parts");
    expect(rapport).not.toContain("SRI + définition");
  });

  it("préremplit régime matrimonial, enfants du foyer et ESG QPI", () => {
    const contact: Contact = {
      ...baseContact,
      situation_familiale: "PACSE",
      regime_matrimonial: "Séparation de biens",
    };
    const members: Contact[] = [
      contact,
      {
        ...baseContact,
        id: 2,
        prenom: "Emma",
        role_foyer: "ENFANT",
      },
      {
        ...baseContact,
        id: 3,
        prenom: "Leo",
        role_foyer: "ENFANT",
      },
    ];
    const documents: Document[] = [
      {
        id: 10,
        contact_id: 1,
        type_document: "QPI",
        nom_fichier: "qpi.pdf",
        chemin_fichier: "/tmp/qpi.pdf",
        taille_fichier: 100,
        sensibilite_extra_financiere:
          "Minimum 10 % d'investissements durables dans le portefeuille.",
        created_at: 200,
        updated_at: 200,
      },
    ];

    const supplement = buildRappelSituationSupplement(members, documents, [], contact);
    expect(countEnfantsFoyer(members)).toBe(2);
    expect(supplement.nombreEnfants).toBe(2);
    expect(latestQpiAppetencesEsg(documents)).toContain("10 %");

    const text = buildDefaultRappelSituation(contact, null, supplement);
    expect(text).toContain("Pacsé(e) — Séparation de biens");
    expect(text).toContain("➞ Nombre d'enfants : 2");
    expect(text).toContain("➞ Appétences ESG : Minimum 10 %");
  });

  it("affiche 0 enfant si le contact sélectionné est lui-même enfant du foyer", () => {
    const enfant: Contact = {
      ...baseContact,
      id: 2,
      prenom: "Emma",
      role_foyer: "ENFANT",
    };
    const members: Contact[] = [
      { ...baseContact, id: 1, role_foyer: "DECLARANT_1" },
      enfant,
      {
        ...baseContact,
        id: 3,
        prenom: "Leo",
        role_foyer: "ENFANT",
      },
    ];

    const supplement = buildRappelSituationSupplement(members, [], [], enfant);
    expect(supplement.nombreEnfants).toBe(0);

    const text = buildDefaultRappelSituation(enfant, null, supplement);
    expect(text).toContain("➞ Nombre d'enfants : 0");
  });

  it("n'hérite pas la fiscalité foyer pour un enfant du foyer", () => {
    const enfant: Contact = {
      ...baseContact,
      id: 2,
      prenom: "Emma",
      role_foyer: "ENFANT",
      revenus_annuels: 0,
    };
    const foyer: Foyer = {
      id: 1,
      nom: "BERNARD",
      type_foyer: "COUPLE",
      tranche_imposition: "30%",
      nombre_parts_fiscales: 3,
      ir_net_a_payer: 12_500,
      created_at: 0,
      updated_at: 0,
    };

    const text = buildDefaultRappelSituation(enfant, foyer);
    expect(text).not.toContain("TMI : 30%");
    expect(text).not.toContain("3 parts");
    expect(text).not.toContain("IR 12");
  });

  it("préremplit immobilier et valeurs mobilières depuis le patrimoine", () => {
    const investissements = [
      baseInvestissement({
        id: 1,
        type_produit: "RESIDENCE_PRINCIPALE",
        nom_produit: "RP",
        montant_initial: 420_000_00,
      }),
      baseInvestissement({
        id: 2,
        type_produit: "ASSURANCE_VIE",
        nom_produit: "Generali",
        montant_initial: 120_000_00,
      }),
    ];

    const text = buildDefaultRappelSituation(baseContact, null, { investissements });
    expect(text).toContain(`➞ ${RM_PANEL_IMMOBILIER_BULLET_LABEL} :`);
    expect(text).toContain("Résidence Principale");
    expect(text).toContain(`➞ ${RM_PANEL_VALEURS_MOBILIERES_BULLET_LABEL} :`);
    expect(text).toContain("Assurance Vie");
  });

  it("syncRappelSituationFromContact met à jour l'âge sans effacer le reste", () => {
    const manual = [
      "➞ Classification : Client non professionnel",
      "➞ Âge : 40 ans",
      "➞ Valeurs mobilières (à détailler si besoin, détention court, moyen ou long terme) : PEA",
    ].join("\n");

    const synced = syncRappelSituationFromContact(manual, baseContact, null, {
      nombreEnfants: 1,
      appetencesEsg: "Préférence ISR",
    });
    expect(synced).toContain("➞ Âge :");
    expect(synced).not.toContain("➞ Âge : 40 ans");
    expect(synced).toContain("➞ Valeurs mobilières : PEA");
    expect(synced).not.toContain("détention court");
    expect(synced).toContain("Marié(e)");
    expect(synced).toContain("➞ Nombre d'enfants : 1");
    expect(synced).toContain("➞ Appétences ESG : Préférence ISR");
  });

  it("complète immobilier / valeurs mobilières vides même avec « : » dans le libellé", () => {
    const manual = [
      "➞ Classification : Client non professionnel",
      `➞ ${RM_PANEL_IMMOBILIER_BULLET_LABEL} :`,
      `➞ ${RM_PANEL_VALEURS_MOBILIERES_BULLET_LABEL} :`,
    ].join("\n");

    const synced = syncRappelSituationFromContact(manual, baseContact, null, {
      investissements: [
        baseInvestissement({
          type_produit: "RESIDENCE_PRINCIPALE",
          nom_produit: "RP",
          montant_initial: 300_000_00,
        }),
        baseInvestissement({
          id: 2,
          type_produit: "ASSURANCE_VIE",
          nom_produit: "AV",
          montant_initial: 50_000_00,
        }),
      ],
    });

    expect(synced).toContain("Résidence Principale");
    expect(synced).toContain("Assurance Vie");
  });

  it("ne remplace pas immobilier / valeurs mobilières déjà saisis", () => {
    const manual = [
      `➞ ${RM_PANEL_IMMOBILIER_BULLET_LABEL} : RP Paris + appétence diversification`,
      `➞ ${RM_PANEL_VALEURS_MOBILIERES_BULLET_LABEL} : PEA long terme`,
    ].join("\n");

    const synced = syncRappelSituationFromContact(manual, baseContact, null, {
      investissements: [
        baseInvestissement({ type_produit: "PINEL", montant_initial: 200_000_00 }),
        baseInvestissement({ type_produit: "PER", montant_initial: 50_000_00 }),
      ],
    });

    expect(synced).toContain("RP Paris + appétence diversification");
    expect(synced).toContain("PEA long terme");
    expect(synced).not.toContain("Pinel");
    expect(synced).not.toContain("PER");
  });

  it("migrateRappelSituationPanelLabels raccourcit les anciens libellés longs", () => {
    const legacy = `➞ ${RM_HINT_IMMOBILIER_BULLET_LABEL} : RP + locatif`;
    expect(migrateRappelSituationPanelLabels(legacy)).toBe(
      `➞ ${RM_PANEL_IMMOBILIER_BULLET_LABEL} : RP + locatif`
    );
  });
});
