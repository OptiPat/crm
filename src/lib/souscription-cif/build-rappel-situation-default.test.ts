import { describe, expect, it } from "vitest";
import {
  buildDefaultRappelSituation,
  buildRappelSituationSupplement,
  countEnfantsFoyer,
  latestQpiAppetencesEsg,
  normalizeRappelSituationClient,
  syncRappelSituationFromContact,
} from "@/lib/souscription-cif/build-rappel-situation-default";
import {
  RM_PANEL_IMMOBILIER_BULLET_LABEL,
  RM_PANEL_REVENUS_BULLET_LABEL,
} from "@/lib/souscription-cif/rapport-mission-recap-table";
import type { Contact } from "@/lib/api/tauri-contacts";
import type { Document } from "@/lib/api/tauri-documents";
import type { Foyer } from "@/lib/api/tauri-foyers";

const baseContact: Contact = {
  id: 1,
  categorie: "CLIENT",
  nom: "ALAMEDA",
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
    const foyer: Foyer = {
      id: 1,
      nom: "ALAMEDA",
      type_foyer: "COUPLE",
      revenu_fiscal_reference: 85000,
      tranche_imposition: "TMI 30%",
      nombre_parts_fiscales: 2.5,
      situation_patrimoniale: "RP + locatif",
      created_at: 0,
      updated_at: 0,
    };

    const text = buildDefaultRappelSituation(baseContact, foyer);
    expect(text).toContain("➞ Âge :");
    expect(text).toContain("➞ Nombre d'enfants :");
    expect(text).toContain(`➞ ${RM_PANEL_REVENUS_BULLET_LABEL} :`);
    expect(text).toContain(`➞ ${RM_PANEL_IMMOBILIER_BULLET_LABEL} :`);
    expect(text).toContain("➞ Épargne de précaution :");
    expect(text).toContain("➞ Endettement :");
    expect(text).toContain("Marié(e)");
    expect(text).toContain("Profil de risque (SRI + définition)");
    expect(text).toContain("SRI 4 — Dynamique");
    expect(text).toContain("croissance à long terme");
    expect(text).toContain("RFR");
    expect(text).toContain("RP + locatif");
  });

  it("raccourcit les libellés panneau pour le rendu rapport", () => {
    const panel = buildDefaultRappelSituation(baseContact, null);
    const rapport = normalizeRappelSituationClient(panel);

    expect(panel).toContain(RM_PANEL_REVENUS_BULLET_LABEL);
    expect(panel).toContain(RM_PANEL_IMMOBILIER_BULLET_LABEL);
    expect(panel).toContain("Profil de risque (SRI + définition)");

    expect(rapport).toContain("➞ Revenus :");
    expect(rapport).toContain("➞ Immobilier :");
    expect(rapport).toContain("➞ Valeurs mobilières :");
    expect(rapport).not.toContain("détention court, moyen ou long terme");
    expect(rapport).toContain("➞ Épargne de précaution :");
    expect(rapport).toContain("➞ Endettement :");
    expect(rapport).toContain("➞ Montant de l'investissement envisagé :");
    expect(rapport).toContain("➞ Appétences ESG :");
    expect(rapport).toContain("➞ Profil de risque : SRI 4 — Dynamique");
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

    const supplement = buildRappelSituationSupplement(members, documents);
    expect(countEnfantsFoyer(members)).toBe(2);
    expect(latestQpiAppetencesEsg(documents)).toContain("10 %");

    const text = buildDefaultRappelSituation(contact, null, supplement);
    expect(text).toContain("Pacsé(e) — Séparation de biens");
    expect(text).toContain("➞ Nombre d'enfants : 2");
    expect(text).toContain("➞ Appétences ESG : Minimum 10 %");
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
    expect(synced).toContain("PEA");
    expect(synced).toContain("Marié(e)");
    expect(synced).toContain("➞ Nombre d'enfants : 1");
    expect(synced).toContain("➞ Appétences ESG : Préférence ISR");
  });
});
