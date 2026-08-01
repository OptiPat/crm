import { describe, expect, it } from "vitest";
import {
  buildBrevoTemplateParams,
  stripDuplicateSectionTitle,
} from "@/lib/newsletter/brevo-template-params";
import type { GeneratedNewsletterContent } from "@/lib/api/tauri-newsletter";

const sample: GeneratedNewsletterContent = {
  subject: "Objet",
  preheader: "Aperçu",
  editionTitle: "Mars 2026",
  intro: "Bonjour, voici l'actu.",
  sections: [
    { title: "Point 1", body: "Corps 1" },
    { title: "Point 2", body: "Corps 2", highlight: true },
  ],
  cta: "Prenez rendez-vous.",
};

describe("buildBrevoTemplateParams", () => {
  it("mappe le contenu newsletter vers les params Brevo", () => {
    const params = buildBrevoTemplateParams(sample);
    expect(params.INTRO).toBe("Bonjour, voici l'actu.");
    expect(params.EDITION_TITLE).toBe("Mars 2026");
    expect(params.PREHEADER).toBe("Aperçu");
    expect(params.SECTION1_TITLE).toBe("Point 1");
    expect(params.SECTION1_BODY).toBe("Corps 1");
    expect(params.SECTION2_TITLE).toBe("Point 2");
    expect(params.SECTION2_BODY).toBe("Corps 2");
    expect(params.HIGHLIGHT_SECTION).toBe("2");
    expect(params.CTA).toBe("Prenez rendez-vous.");
    expect(params.CONTENT_HTML).toContain("Point 1");
    expect(params.CONTENT_HTML).toContain("Corps 2");
    expect(params.CONTENT_HTML).toContain("Prenez rendez-vous.");
  });

  it("retire le titre dupliqué en tête du corps", () => {
    const withDup: GeneratedNewsletterContent = {
      ...sample,
      sections: [{ title: "<strong>PER</strong>", body: "PER\nTexte utile." }],
    };
    expect(buildBrevoTemplateParams(withDup).SECTION1_BODY).toBe("Texte utile.");
  });
});

describe("stripDuplicateSectionTitle", () => {
  it("retire une première ligne identique au titre", () => {
    expect(stripDuplicateSectionTitle("Fiscalité", "Fiscalité\nLe reste.")).toBe("Le reste.");
  });
});
