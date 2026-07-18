import { describe, expect, it } from "vitest";
import {
  DEFAULT_PIPE_CHECKLIST_TEMPLATES,
  R1_ESTIMATION_RETRAITE_STEPS,
} from "@/lib/pipe/pipe-checklist-template";
import {
  buildR1ChecklistEmailPreviewDocument,
  formatR1ChecklistEmailList,
  suggestR1ChecklistProfileFromContact,
} from "@/lib/pipe/pipe-checklist-email-list";
import { getActiveR1ChecklistItems } from "@/lib/pipe/r1-document-checklist";

describe("formatR1ChecklistEmailList", () => {
  it("formate les pièces de base et le profil salarié en puces (sans conditionnel)", () => {
    const items = getActiveR1ChecklistItems(DEFAULT_PIPE_CHECKLIST_TEMPLATES, {
      salarie: true,
      chef_entreprise: false,
      retraite: false,
    });

    const { text, html } = formatR1ChecklistEmailList(items);

    expect(text).toContain("Dernier avis d'imposition.");
    expect(text).toContain(
      "Relevés d'épargne (Livrets, Assurance-vie, PER, PEE/PERCO, comptes titres...)."
    );
    expect(text).toContain("Dernier bulletin de salaire.");
    expect(text).not.toContain("Si vous êtes salarié");
    expect(html).toContain("<ul");
    expect(html).toContain("list-style-type:disc");
    expect(html).not.toContain("Si vous êtes salarié");
  });

  it("n'inclut pas les pièces salarié sans profil", () => {
    const items = getActiveR1ChecklistItems(DEFAULT_PIPE_CHECKLIST_TEMPLATES, {
      salarie: false,
      chef_entreprise: false,
      retraite: false,
    });

    const { text } = formatR1ChecklistEmailList(items);

    expect(text).toContain("Dernier avis d'imposition.");
    expect(text).not.toContain("bulletin de salaire");
  });

  it("puce retraite puis étapes numérotées info-retraite.fr", () => {
    const items = getActiveR1ChecklistItems(DEFAULT_PIPE_CHECKLIST_TEMPLATES, {
      salarie: false,
      chef_entreprise: false,
      retraite: true,
    });

    const { text, html } = formatR1ChecklistEmailList(items);

    expect(text).toContain("Estimation pension de retraite.");
    expect(text).not.toContain("Pour l'estimation retraite");
    expect(text).toContain("1. RDV sur info-retraite.fr");
    expect(text).toContain('2. Onglet "Mon estimation retraite"');
    expect(text).toContain("3. Télécharger le PDF.");
    expect(text).not.toMatch(/45\s*ans/i);
    expect(html).toContain("<ol");
    expect(html).toContain("list-style-type:decimal");
    expect(R1_ESTIMATION_RETRAITE_STEPS[0]).toBe("RDV sur info-retraite.fr");
  });

  it("génère un document iframe avec styles de listes", () => {
    const doc = buildR1ChecklistEmailPreviewDocument(
      '<ul style="list-style-type:disc"><li>Test</li></ul>'
    );
    expect(doc).toContain("<!DOCTYPE html>");
    expect(doc).toContain("list-style-type:disc");
    expect(doc).toContain("<li>Test</li>");
  });
});

describe("suggestR1ChecklistProfileFromContact", () => {
  it("suggère salarié depuis la profession", () => {
    expect(
      suggestR1ChecklistProfileFromContact({ profession: "Cadre salarié", date_naissance: undefined })
        .salarie
    ).toBe(true);
  });

  it("suggère chef d'entreprise", () => {
    expect(
      suggestR1ChecklistProfileFromContact({
        profession: "Chef d'entreprise",
        date_naissance: undefined,
      }).chef_entreprise
    ).toBe(true);
  });

  it("ne suggère pas salarié pour « agent immobilier »", () => {
    expect(
      suggestR1ChecklistProfileFromContact({
        profession: "Agent immobilier",
        date_naissance: undefined,
      }).salarie
    ).toBe(false);
  });

  it("ne suggère pas retraite uniquement par l'âge", () => {
    const birth = Math.floor(new Date(1980, 0, 1).getTime() / 1000);
    expect(
      suggestR1ChecklistProfileFromContact({
        profession: "Cadre",
        date_naissance: birth,
      }).retraite
    ).toBe(false);
  });
});
