import { describe, expect, it } from "vitest";
import type { Contact } from "@/lib/api/tauri-contacts";
import type { Investissement } from "@/lib/api/tauri-investissements";
import type { PipeR3ImmoDocumentChecklist } from "@/lib/api/tauri-pipe-r3-immo-checklist";
import {
  buildR3ImmoChecklistContext,
  describeR3ImmoItemVisibility,
  getActiveR3ImmoChecklistItems,
  isR3ImmoVisibilityRuleActive,
  shouldShowR3ImmoDocumentChecklist,
} from "@/lib/pipe/r3-immo-document-checklist";

function baseChecklist(
  overrides: Partial<PipeR3ImmoDocumentChecklist> = {}
): PipeR3ImmoDocumentChecklist {
  return {
    pipe_id: 1,
    profile_salarie: false,
    profile_chef_entreprise: false,
    emprunteur_personne_morale: false,
    revenus_fonciers_hors_micro: false,
    revenus_via_sci: false,
    projet_vefa: false,
    projet_ancien: false,
    projet_scpi: false,
    items: {},
    updated_at: 0,
    ...overrides,
  };
}

function baseContact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: 1,
    nom: "DUPONT",
    prenom: "Jean",
    categorie: "PROSPECT_CLIENT",
    statut_suivi: "ACTIF",
    created_at: 0,
    updated_at: 0,
    ...overrides,
  };
}

describe("r3-immo-document-checklist", () => {
  it("affiche la checklist pour un RDV R3 Immo", () => {
    expect(
      shouldShowR3ImmoDocumentChecklist([
        {
          id: 1,
          pipe_id: 1,
          entry_type: "RDV",
          titre: "R3 Immo",
          contenu: null,
          occurred_at: 1,
          created_at: 1,
        },
      ])
    ).toBe(true);
  });

  it("masque livret de famille sans couple ni enfant", () => {
    const ctx = buildR3ImmoChecklistContext({
      contact: baseContact({ situation_familiale: "CELIBATAIRE" }),
      secondaryContactId: null,
      foyerMembers: [],
      investissements: [],
      checklist: baseChecklist(),
    });
    expect(isR3ImmoVisibilityRuleActive("couple_or_enfants", ctx)).toBe(false);
    expect(getActiveR3ImmoChecklistItems(ctx).some((i) => i.id === "livret_famille")).toBe(
      false
    );
  });

  it("affiche quittance et bail pour locataire", () => {
    const ctx = buildR3ImmoChecklistContext({
      contact: baseContact({ statut_occupation_logement: "LOCATAIRE" }),
      secondaryContactId: null,
      foyerMembers: [],
      investissements: [],
      checklist: baseChecklist(),
    });
    const ids = getActiveR3ImmoChecklistItems(ctx).map((i) => i.id);
    expect(ids).toContain("quittance_loyer");
    expect(ids).toContain("bail");
  });

  it("affiche dissolution PACS pour situation SEPARE", () => {
    const ctx = buildR3ImmoChecklistContext({
      contact: baseContact({ situation_familiale: "SEPARE" }),
      secondaryContactId: null,
      foyerMembers: [],
      investissements: [],
      checklist: baseChecklist(),
    });
    expect(getActiveR3ImmoChecklistItems(ctx).some((i) => i.id === "dissolution_pacs")).toBe(
      true
    );
  });

  it("n'affiche pas crédits en cours sans charge ni crédit immo structuré", () => {
    const inv: Investissement = {
      id: 1,
      contact_id: 1,
      type_produit: "IMMOBILIER",
      nom_produit: "Appartement",
      montant_initial: 100_000,
      versement_programme: false,
      reinvestissement_dividendes: false,
      origine: "MON_CONSEIL",
      created_at: 1,
      updated_at: 1,
    };
    const ctx = buildR3ImmoChecklistContext({
      contact: baseContact({ charges_emprunts: 0 }),
      secondaryContactId: null,
      foyerMembers: [],
      investissements: [inv],
      checklist: baseChecklist(),
    });
    const ids = getActiveR3ImmoChecklistItems(ctx).map((i) => i.id);
    expect(ids).not.toContain("offre_pret");
    expect(ids).not.toContain("tableaux_amortissement");
  });

  it("affiche crédits en cours si CRD renseigné sur immo", () => {
    const inv: Investissement = {
      id: 1,
      contact_id: 1,
      type_produit: "IMMOBILIER",
      nom_produit: "Appartement",
      credit_crd: 120_000_00,
      versement_programme: false,
      reinvestissement_dividendes: false,
      origine: "MON_CONSEIL",
      created_at: 1,
      updated_at: 1,
    };
    const ctx = buildR3ImmoChecklistContext({
      contact: baseContact({ charges_emprunts: 0 }),
      secondaryContactId: null,
      foyerMembers: [],
      investissements: [inv],
      checklist: baseChecklist(),
    });
    const ids = getActiveR3ImmoChecklistItems(ctx).map((i) => i.id);
    expect(ids).toContain("offre_pret");
    expect(ids).toContain("tableaux_amortissement");
  });

  it("affiche titre de propriété pour propriétaire sans patrimoine immo en base", () => {
    const ctx = buildR3ImmoChecklistContext({
      contact: baseContact({ statut_occupation_logement: "PROPRIETAIRE" }),
      secondaryContactId: null,
      foyerMembers: [],
      investissements: [],
      checklist: baseChecklist(),
    });
    const ids = getActiveR3ImmoChecklistItems(ctx).map((i) => i.id);
    expect(ids).toContain("titre_propriete");
    expect(ids).not.toContain("declaration_ifi");
  });

  it("affiche patrimoine immo si investissement immobilier", () => {
    const inv: Investissement = {
      id: 1,
      contact_id: 1,
      type_produit: "IMMOBILIER",
      nom_produit: "Appartement",
      montant_initial: 100_000,
      date_souscription: 1,
      versement_programme: false,
      reinvestissement_dividendes: false,
      origine: "MON_CONSEIL",
      created_at: 1,
      updated_at: 1,
    };
    const ctx = buildR3ImmoChecklistContext({
      contact: baseContact(),
      secondaryContactId: null,
      foyerMembers: [],
      investissements: [inv],
      checklist: baseChecklist(),
    });
    expect(getActiveR3ImmoChecklistItems(ctx).some((i) => i.id === "titre_propriete")).toBe(
      true
    );
  });

  it("affiche estimatif de retraite si 55 ans ou plus et pas retraité", () => {
    const dateNaissance = Math.floor(Date.UTC(1965, 5, 15) / 1000);
    const ctx = buildR3ImmoChecklistContext({
      contact: baseContact({
        date_naissance: dateNaissance,
        profession: "Cadre commercial",
      }),
      secondaryContactId: null,
      foyerMembers: [],
      investissements: [],
      checklist: baseChecklist(),
    });
    const ids = getActiveR3ImmoChecklistItems(ctx).map((i) => i.id);
    expect(ids).toContain("estimatif_retraite");
    expect(ids).not.toContain("pensions_retraites");
  });

  it("affiche pension et masque salarié si profession retraité", () => {
    const dateNaissance = Math.floor(Date.UTC(1965, 5, 15) / 1000);
    const ctx = buildR3ImmoChecklistContext({
      contact: baseContact({
        date_naissance: dateNaissance,
        profession: "Retraité",
      }),
      secondaryContactId: null,
      foyerMembers: [],
      investissements: [],
      checklist: baseChecklist(),
      r1Checklist: { profile_salarie: true, profile_chef_entreprise: false },
    });
    const ids = getActiveR3ImmoChecklistItems(ctx).map((i) => i.id);
    expect(ids).toContain("pensions_retraites");
    expect(ids).toContain("avis_imposition_salarie");
    expect(ids).not.toContain("estimatif_retraite");
    expect(ids).not.toContain("bulletins_paie");
  });

  it("décrit la visibilité avec l'âge ou la situation fiche", () => {
    const dateNaissance = Math.floor(Date.UTC(1965, 5, 15) / 1000);
    const ctx = buildR3ImmoChecklistContext({
      contact: baseContact({
        date_naissance: dateNaissance,
        situation_familiale: "SEPARE",
      }),
      secondaryContactId: null,
      foyerMembers: [],
      investissements: [],
      checklist: baseChecklist(),
    });
    expect(describeR3ImmoItemVisibility("estimatif_retraite_55", ctx)).toMatch(/\d+ ans/);
    expect(describeR3ImmoItemVisibility("separe", ctx)).toBe("Dissolution de PACS");
    expect(describeR3ImmoItemVisibility("always", ctx)).toBeNull();
  });
});
