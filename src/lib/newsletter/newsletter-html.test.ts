import { describe, expect, it } from "vitest";
import {
  buildNewsletterHtml,
  buildNewsletterPlainBody,
  formatNewsletterEditionLabel,
  parseNewsletterTemplateMeta,
  serializeNewsletterTemplateMeta,
} from "@/lib/newsletter/newsletter-html";

describe("newsletter-html", () => {
  const sampleContent = {
    subject: "Objet inbox accrocheur",
    preheader: "Ce qu'il faut savoir ce mois-ci pour votre patrimoine.",
    editionTitle: "Assurance emprunteur : les points clés",
    intro: "Bonjour {{prenom}},",
    sections: [
      { title: "Point clé", body: "Corps du point.", highlight: false },
      { title: "Échéance", body: "Date limite à retenir.", highlight: true },
    ],
    cta: "Prenez rendez-vous.",
  };

  it("buildNewsletterPlainBody assembles sections", () => {
    const plain = buildNewsletterPlainBody({
      subject: "Objet",
      intro: "Bonjour {{prenom}},",
      sections: [{ title: "Point clé", body: "Corps du point." }],
      cta: "Prenez rendez-vous.",
    });
    expect(plain).toContain("Bonjour {{prenom}},");
    expect(plain).toContain("Point clé");
    expect(plain).toContain("Prenez rendez-vous.");
  });

  it("buildNewsletterHtml includes premium layout markers", () => {
    const html = buildNewsletterHtml(sampleContent, {
      cabinetName: "Cabinet Test",
      editionLabel: "juin 2026",
      cgpPrenom: "Jean",
      cgpNom: "Dupont",
      cgpEmail: "jean@cabinet.fr",
      agendaUrl: "https://calendly.com/test",
    });
    expect(html).toContain("Lettre patrimoniale");
    expect(html).toContain("juin 2026");
    expect(html).not.toContain("Assurance emprunteur : les points clés");
    expect(html).toContain("Ce qu'il faut savoir ce mois-ci");
    expect(html).toContain(">01<");
    expect(html).toContain(">02<");
    expect(html).toContain("Prendre rendez-vous");
    expect(html).toContain("Me répondre par email");
    expect(html).toContain("Votre conseiller");
    expect(html).toContain("Jean Dupont");
  });

  it("formatNewsletterEditionLabel uses fr-FR month and year", () => {
    const label = formatNewsletterEditionLabel(new Date(2026, 5, 1));
    expect(label).toMatch(/2026/);
  });

  it("serializes and parses newsletter HTML meta", () => {
    const json = serializeNewsletterTemplateMeta("<html>test</html>");
    const meta = parseNewsletterTemplateMeta(json);
    expect(meta?.newsletter_html).toBe("<html>test</html>");
  });
});
