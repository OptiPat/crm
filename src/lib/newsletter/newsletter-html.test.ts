import { describe, expect, it } from "vitest";
import {
  buildNewsletterHtml,
  buildNewsletterPlainBody,
  formatNewsletterEditionLabel,
  mergeNewsletterDraftFromPlain,
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
    const html = buildNewsletterHtml(
      {
        ...sampleContent,
        includeFooterPhone: true,
        includeFooterSite: true,
        includeFooterAddress: true,
      },
      {
      cabinetName: "Cabinet Test",
      editionLabel: "juin 2026",
      cgpPrenom: "Jean",
      cgpNom: "Dupont",
      cgpEmail: "jean@cabinet.fr",
      cgpPhone: "01 23 45 67 89",
      siteWeb: "https://cabinet.fr",
      postalAddress: "12 rue Test, 75002 Paris",
      agendaUrl: "https://calendly.com/test",
    });
    expect(html).toContain("Lettre patrimoniale");
    expect(html).toContain("juin 2026");
    expect(html).toContain("Assurance emprunteur : les points clés");
    expect(html).toContain("Ce qu'il faut savoir ce mois-ci");
    expect(html).toContain(">01<");
    expect(html).toContain(">02<");
    expect(html).toContain("Prendre rendez-vous");
    expect(html).not.toContain("Prenez rendez-vous.");
    expect(html).toContain("Me répondre par email");
    expect(html).toContain("Votre conseiller");
    expect(html).toContain("Jean Dupont");
    expect(html).toContain("01 23 45 67 89");
    expect(html).toContain("Site web");
    expect(html).toContain("12 rue Test, 75002 Paris");
  });

  it("uses softer CTA button styling", () => {
    const html = buildNewsletterHtml(
      { ...sampleContent, cta: "Prenez rendez-vous.", layout: "minimal" },
      { agendaUrl: "https://calendly.com/test" }
    );
    const btn = html.match(/class="nl-cta-btn"[^>]*>/)?.[0] ?? "";
    expect(btn).toContain("border-radius:4px");
    expect(btn).not.toContain("text-transform:uppercase");
    expect(html).toContain("Prendre rendez-vous");
  });

  it("uses title font in header meta labels", () => {
    const html = buildNewsletterHtml(sampleContent, {
      cabinetName: "Cabinet Test",
      titleFont: "classic",
    });
    const metaBlock = html.match(
      /Lettre patrimoniale[\s\S]{0,200}/
    )?.[0] ?? "";
    expect(metaBlock).toContain("font-family:Georgia");
  });

  it("fuses RDV CTA with agenda into one button only", () => {
    const html = buildNewsletterHtml(
      { ...sampleContent, cta: "Prenez rendez-vous pour en discuter." },
      { agendaUrl: "https://calendly.com/test", cgpEmail: "a@b.fr" }
    );
    const btnMatches = html.match(/Prendre rendez-vous/g) ?? [];
    expect(btnMatches.length).toBe(1);
    expect(html).toContain('href="https://calendly.com/test"');
  });

  it("renders explicit CTA button with label and URL", () => {
    const html = buildNewsletterHtml(
      {
        ...sampleContent,
        cta: "Notre guide est disponible en ligne.",
        ctaLabel: "Télécharger le guide",
        ctaUrl: "https://cabinet.fr/guide",
      },
      { agendaUrl: "https://calendly.com/test" }
    );
    expect(html).toContain("Télécharger le guide");
    expect(html).toContain('href="https://cabinet.fr/guide"');
    expect(html).toContain("Notre guide est disponible");
    expect(html).toContain("Prendre rendez-vous");
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

  it("mergeNewsletterDraftFromPlain reflects manual intro edit in HTML", () => {
    const plain = [
      "Bonjour {{prenom}},",
      "",
      "Alors que certains passent leur mois de juin à suer à grosses gouttes.",
      "",
      "Les stars du palmarès 2025 :",
      "Comète truste la première place avec 9%.",
      "",
      "Prenez rendez-vous.",
    ].join("\n");
    const draft = mergeNewsletterDraftFromPlain("Objet SCPI", plain, {
      subject: "Objet SCPI",
      intro: "",
      sections: [],
      cta: "",
      preheader: "Palmarès SCPI",
    });
    const html = buildNewsletterHtml(draft);
    expect(html).toContain("grosses gouttes");
    expect(html).toContain("Les stars du palmarès 2025");
    expect(html).toContain("Comète truste");
    expect(draft.sections.some((s) => s.body.includes("juin"))).toBe(true);
  });

  it("omits footer contact lines unless explicitly included", () => {
    const html = buildNewsletterHtml(
      { ...sampleContent, includeConseiller: false },
      {
        cabinetName: "Cabinet Test",
        cgpPhone: "01 23 45 67 89",
        siteWeb: "https://cabinet.fr",
        postalAddress: "12 rue Test, 75002 Paris",
      }
    );
    expect(html).not.toContain("Site web");
    expect(html).not.toContain("01 23 45 67 89");
    expect(html).not.toContain("12 rue Test");
  });

  it("omits conseiller block when includeConseiller is false", () => {
    const html = buildNewsletterHtml(
      {
        ...sampleContent,
        includeConseiller: false,
        conseillerName: "Nicolas PLAZA",
        conseillerPhone: "0652138822",
      },
      {
        cabinetName: "Cabinet Test",
        cgpPrenom: "Nicolas",
        cgpNom: "PLAZA",
        cgpPhone: "0652138822",
      }
    );
    expect(html).not.toContain("Votre conseiller");
    expect(html).not.toContain("Nicolas PLAZA");
  });

  it("uses edited conseiller name in HTML", () => {
    const html = buildNewsletterHtml(
      {
        ...sampleContent,
        conseillerName: "Jean DUPONT",
        conseillerPhone: "0102030405",
      },
      { cabinetName: "Cabinet Test", cgpPrenom: "Nicolas", cgpNom: "PLAZA" }
    );
    expect(html).toContain("Jean DUPONT");
    expect(html).toContain("0102030405");
    expect(html).not.toContain("Nicolas PLAZA");
  });

  it("omits CTA block when includeCta is false", () => {
    const html = buildNewsletterHtml(
      { ...sampleContent, includeCta: false },
      { cabinetName: "Cabinet Test" }
    );
    expect(html).not.toContain("Prendre rendez-vous");
    expect(html).not.toContain("Me répondre par email");
  });

  it("uses secondary color in header stripe and section numbers", () => {
    const html = buildNewsletterHtml(sampleContent, {
      cabinetName: "Cabinet Test",
      secondaryColor: "#ff5500",
    });
    expect(html).toContain("#ff5500");
    expect(html).toContain(">01<");
  });

  it("renders rich blocks at placement", () => {
    const html = buildNewsletterHtml(
      {
        ...sampleContent,
        blocks: [
          {
            id: "b1",
            type: "stat",
            placement: { type: "after_intro" },
            value: "9 %",
            label: "Rendement palmarès",
          },
          {
            id: "b2",
            type: "quote",
            placement: { type: "before_section", index: 0 },
            text: "La fiscalité évolue vite.",
            attribution: "AMF",
          },
        ],
      },
      { cabinetName: "Cabinet Test" }
    );
    expect(html).toContain("9 %");
    expect(html).toContain("Rendement palmarès");
    expect(html).toContain("La fiscalité évolue vite.");
    expect(html).toContain("— AMF");
  });

  it("applies typography settings to body font", () => {
    const html = buildNewsletterHtml(sampleContent, {
      cabinetName: "Cabinet Test",
      bodyFont: "modern",
      bodyFontSize: "lg",
    });
    expect(html).toContain("Arial,Helvetica,sans-serif");
    expect(html).toContain("font-size:19px");
  });

  it("includes mobile optimization classes", () => {
    const html = buildNewsletterHtml(sampleContent, {
      cabinetName: "Cabinet Test",
      agendaUrl: "https://calendly.com/test",
    });
    expect(html).toContain("nl-cta-btn");
    expect(html).toContain("nl-header-stack");
    expect(html).toContain("nl-container");
    expect(html).toContain("nl-mailto-link");
    expect(html).toContain("-webkit-text-size-adjust");
    expect(html).toContain("@media only screen and (max-width: 520px)");
  });

  it("minimal layout hides section numbers", () => {
    const html = buildNewsletterHtml(
      { ...sampleContent, layout: "minimal" },
      { cabinetName: "Cabinet Test" }
    );
    expect(html).not.toContain(">01<");
    expect(html).toContain("Point clé");
  });

  it("mergeNewsletterDraftFromPlain keeps Mistral section highlights by index", () => {
    const previous = {
      subject: "Objet",
      preheader: "Preheader conservé",
      intro: "Intro",
      sections: [
        { title: "Point clé", body: "Corps.", highlight: true },
        { title: "Autre", body: "Suite.", highlight: false },
      ],
      cta: "RDV",
    };
    const plain = buildNewsletterPlainBody(previous);
    const draft = mergeNewsletterDraftFromPlain("Objet", plain, previous);
    expect(draft.preheader).toBe("Preheader conservé");
    expect(draft.sections[0]?.highlight).toBe(true);
    expect(draft.sections[1]?.highlight).toBeUndefined();
  });
});
