import { describe, expect, it } from "vitest";
import { cloneDefaultR3ImmoChecklistTemplate } from "@/lib/pipe/r3-immo-checklist-template";
import {
  buildR3ImmoChecklistEmailVariablesFromContext,
  buildR3ImmoChecklistEmailVariablesFromTemplate,
  shouldInjectR3ImmoChecklistEmailVars,
  templateUsesR3ImmoChecklistEmailVariables,
} from "@/lib/pipe/pipe-r3-immo-checklist-email-vars";
import { buildR3ImmoRdvPlanningContext } from "@/lib/pipe/pipe-r3-immo-rdv-planning";
import type { Contact } from "@/lib/api/tauri-contacts";

describe("pipe-r3-immo-checklist-email-vars", () => {
  it("détecte la variable HTML dans le modèle", () => {
    expect(
      templateUsesR3ImmoChecklistEmailVariables(
        "RDV R3 Immo",
        "<p>{{liste_documents_r3_immo_html}}</p>"
      )
    ).toBe(true);
    expect(templateUsesR3ImmoChecklistEmailVariables("RDV R3 Immo", "Sans liste")).toBe(false);
  });

  it("n'injecte la liste que pour R3 immo", () => {
    expect(
      shouldInjectR3ImmoChecklistEmailVars({
        rdvStage: "R3",
        timelineEntryTitre: "R3 Immo",
      })
    ).toBe(true);
    expect(
      shouldInjectR3ImmoChecklistEmailVars({
        rdvStage: "R3",
        timelineEntryTitre: "R3 Placements",
      })
    ).toBe(false);
    expect(
      shouldInjectR3ImmoChecklistEmailVars({
        rdvStage: "R3",
        timelineEntryTitre: "R3",
      })
    ).toBe(false);
    expect(
      shouldInjectR3ImmoChecklistEmailVars({
        rdvStage: "R1",
        timelineEntryTitre: "R3 Immo",
      })
    ).toBe(false);
  });

  it("génère une liste HTML groupée par section", () => {
    const template = cloneDefaultR3ImmoChecklistTemplate();
    const vars = buildR3ImmoChecklistEmailVariablesFromTemplate(template);
    expect(vars.liste_documents_r3_immo_html).toContain("<ul");
    expect(vars.liste_documents_r3_immo_html).toContain("Identification");
    expect(vars.liste_documents_r3_immo_html).toContain("Carte nationale");
  });

  it("aligne l'aperçu planification et le contexte dossier enregistré", () => {
    const template = cloneDefaultR3ImmoChecklistTemplate();
    const contact: Contact = {
      id: 1,
      nom: "DUPONT",
      prenom: "Jean",
      categorie: "PROSPECT_CLIENT",
      statut_suivi: "ACTIF",
      created_at: 0,
      updated_at: 0,
    };
    const draft = {
      profile_salarie: true,
      profile_chef_entreprise: true,
      profile_revenus_configured: true,
      emprunteur_personne_morale: false,
      revenus_fonciers_hors_micro: false,
      revenus_via_sci: false,
      projet_vefa: false,
      projet_ancien: false,
      projet_scpi: false,
    };
    const ctx = buildR3ImmoRdvPlanningContext({
      contact,
      secondaryContactId: null,
      foyerMembers: [],
      investissements: [],
      r1Checklist: null,
      draft,
    });
    const vars = buildR3ImmoChecklistEmailVariablesFromContext(template, ctx);
    expect(vars.liste_documents_r3_immo_html).toContain("bulletins de paie");
    expect(vars.liste_documents_r3_immo_html).toContain("derniers bilans");
  });
});
