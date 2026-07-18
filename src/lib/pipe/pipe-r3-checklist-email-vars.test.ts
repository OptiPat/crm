import { describe, expect, it } from "vitest";
import { DEFAULT_PIPE_CHECKLIST_TEMPLATES } from "@/lib/pipe/pipe-checklist-template";
import {
  buildR3ChecklistEmailVariablesFromTemplates,
  shouldInjectR3PlacementsChecklistEmailVars,
  templateUsesR3ChecklistEmailVariables,
} from "@/lib/pipe/pipe-r3-checklist-email-vars";

describe("pipe-r3-checklist-email-vars", () => {
  it("détecte la variable HTML dans le modèle", () => {
    expect(
      templateUsesR3ChecklistEmailVariables(
        "RDV R3",
        "<p>{{liste_documents_r3_html}}</p>"
      )
    ).toBe(true);
    expect(templateUsesR3ChecklistEmailVariables("RDV R3", "Sans liste")).toBe(false);
  });

  it("n'injecte la liste que pour R3 placements", () => {
    expect(
      shouldInjectR3PlacementsChecklistEmailVars({
        rdvStage: "R3",
        timelineEntryTitre: "R3 Placements",
      })
    ).toBe(true);
    expect(
      shouldInjectR3PlacementsChecklistEmailVars({
        rdvStage: "R3",
        timelineEntryTitre: "R3",
      })
    ).toBe(true);
    expect(
      shouldInjectR3PlacementsChecklistEmailVars({
        rdvStage: "R3",
        timelineEntryTitre: "R3 Immo",
      })
    ).toBe(false);
    expect(
      shouldInjectR3PlacementsChecklistEmailVars({
        rdvStage: "R1",
        timelineEntryTitre: "R3 Placements",
      })
    ).toBe(false);
  });

  it("génère une liste HTML depuis les modèles", () => {
    const vars = buildR3ChecklistEmailVariablesFromTemplates(DEFAULT_PIPE_CHECKLIST_TEMPLATES);
    expect(vars.liste_documents_r3_html).toContain("<ul");
    expect(vars.liste_documents_r3_html).toContain("RIB");
    expect(vars.liste_documents_r3_html).not.toContain("DER");
  });
});
