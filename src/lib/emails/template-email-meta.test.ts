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
    created_at: 0,
    updated_at: 0,
  },
];

describe("suggestTemplateIdForEtiquette", () => {
  it("mappe les noms d'étiquettes système", () => {
    expect(suggestTemplateIdForEtiquette("Suivi > 1 an", templates)).toBe(1);
    expect(suggestTemplateIdForEtiquette("Déclaration IR", templates)).toBe(2);
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
});
