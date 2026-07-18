import { describe, expect, it } from "vitest";
import {
  buildR1ChecklistEmailVariablesFromProfile,
  templateUsesR1ChecklistEmailVariables,
} from "@/lib/pipe/pipe-r1-checklist-email-vars";
import { DEFAULT_PIPE_CHECKLIST_TEMPLATES } from "@/lib/pipe/pipe-checklist-template";

describe("pipe-r1-checklist-email-vars", () => {
  it("détecte la variable HTML liste documents dans le modèle", () => {
    expect(
      templateUsesR1ChecklistEmailVariables(
        "RDV R1",
        "<p>{{liste_documents_r1_html}}</p>"
      )
    ).toBe(true);
    expect(
      templateUsesR1ChecklistEmailVariables("RDV R1", "Legacy {{liste_documents_r1}}")
    ).toBe(true);
    expect(templateUsesR1ChecklistEmailVariables("RDV", "Sans liste")).toBe(false);
  });

  it("génère le HTML depuis le profil", () => {
    const vars = buildR1ChecklistEmailVariablesFromProfile(DEFAULT_PIPE_CHECKLIST_TEMPLATES, {
      salarie: true,
      chef_entreprise: false,
      retraite: false,
    });

    expect(vars.liste_documents_r1_html).toContain("<ul");
    expect(vars.liste_documents_r1_html).toContain("avis d'imposition");
    expect(vars).not.toHaveProperty("liste_documents_r1");
  });
});
