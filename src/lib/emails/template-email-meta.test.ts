import { describe, expect, it } from "vitest";
import {
  renderTemplatePreview,
  SAMPLE_PREVIEW_CONTACT,
  suggestTemplateIdForEtiquette,
} from "./template-email-meta";
import type { TemplateEmail } from "@/lib/api/tauri-templates-email";

const templates: TemplateEmail[] = [
  {
    id: 1,
    nom: "Relance — client 1 an sans contact",
    sujet: "Sujet {{prenom}}",
    corps: "Corps",
    categorie: "RELANCE",
    variables: null,
    agenda_link_id: null,
    relance_template_id: null,
    tutoiement_template_id: null,
    created_at: 0,
    updated_at: 0,
  },
  {
    id: 2,
    nom: "Rappel déclaration IR",
    sujet: "IR",
    corps: "IR",
    categorie: "FISCALITE",
    variables: null,
    agenda_link_id: null,
    relance_template_id: null,
    tutoiement_template_id: null,
    created_at: 0,
    updated_at: 0,
  },
  {
    id: 3,
    nom: "Exceltis — remboursement et arbitrage",
    sujet: "Exceltis",
    corps: "Corps",
    categorie: "ARBITRAGE",
    variables: null,
    agenda_link_id: null,
    relance_template_id: null,
    tutoiement_template_id: null,
    created_at: 0,
    updated_at: 0,
  },
];

describe("suggestTemplateIdForEtiquette", () => {
  it("privilégie un modèle au même nom que l'étiquette", () => {
    const withExact = [
      ...templates,
      {
        id: 9,
        nom: "Suivi > 1 an",
        sujet: "",
        corps: "",
        categorie: "SUIVI_ANNUEL",
        variables: null,
        agenda_link_id: null,
        relance_template_id: null,
        tutoiement_template_id: null,
        created_at: 0,
        updated_at: 0,
      },
    ];
    expect(suggestTemplateIdForEtiquette("Suivi > 1 an", withExact)).toBe(9);
  });

  it("mappe les noms d'étiquettes système", () => {
    expect(suggestTemplateIdForEtiquette("Suivi > 1 an", templates)).toBe(1);
    expect(suggestTemplateIdForEtiquette("Déclaration IR", templates)).toBe(2);
  });

  it("propose le modèle Exceltis pour les étiquettes millésime", () => {
    expect(suggestTemplateIdForEtiquette("Exceltis — Février 2025", templates)).toBe(3);
  });
});

describe("renderTemplatePreview", () => {
  it("remplace les variables", () => {
    const out = renderTemplatePreview(
      "Bonjour {{prenom}}",
      "De la part de {{cgp_prenom}}",
      SAMPLE_PREVIEW_CONTACT,
      { prenom: "Paul", nom: "Martin", wizard_completed: true, wizard_step: 4 }
    );
    expect(out.subject).toBe("Bonjour Marie");
    expect(out.body).toContain("Paul");
  });

  it("remplace les variables Exceltis dont rendement_exceltis", () => {
    const out = renderTemplatePreview(
      "Exceltis {{millesime}} — {{prenom}}",
      "Support {{etiquette_nom}} — performance {{rendement_exceltis}}.",
      SAMPLE_PREVIEW_CONTACT,
      null
    );
    expect(out.subject).toBe("Exceltis Février 2025 — Marie");
    expect(out.body).toContain("Exceltis — Février 2025");
    expect(out.body).toContain("performance 9 %/an");
  });

  it("forSend n'injecte pas de données fictives Exceltis", () => {
    const out = renderTemplatePreview(
      "Exceltis {{millesime}} — {{prenom}}",
      "Support {{etiquette_nom}} — performance {{rendement_exceltis}}.",
      SAMPLE_PREVIEW_CONTACT,
      null,
      undefined,
      undefined,
      undefined,
      { forSend: true }
    );
    expect(out.subject).toBe("Exceltis {{millesime}} — Marie");
    expect(out.body).not.toContain("Février 2025");
    expect(out.body).not.toContain("9 %/an");
  });
});
