import { describe, expect, it } from "vitest";
import {
  buildNewsletterHtml,
  buildNewsletterHtmlOptions,
  buildNewsletterPlainBody,
  buildNewsletterPlainBodyForExport,
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

  it("renders rich text formatting in section body", () => {
    const html = buildNewsletterHtml({
      ...sampleContent,
      sections: [
        {
          title: "Point clé",
          body: "<div>Texte <b>gras</b> et <i>italique</i></div>",
          highlight: false,
        },
      ],
    });
    expect(html).toContain("nl-rich-text");
    expect(html).toContain("gras");
    expect(html).toMatch(/<b[^>]*>[\s\S]*gras[\s\S]*<\/b>/i);
  });

  it("buildNewsletterHtml includes premium layout markers", () => {
    const html = buildNewsletterHtml(
      {
        ...sampleContent,
        includeConseiller: false,
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
    expect(html).not.toContain("Me répondre par email");
    expect(html).not.toContain("Votre conseiller");
    expect(html).toContain("Jean Dupont");
    expect(html).toContain("01 23 45 67 89");
    expect(html).toContain("cabinet.fr");
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

  it("embeds cabinet logo in header and hides cabinet name text", () => {
    const html = buildNewsletterHtml(sampleContent, {
      cabinetName: "PLAZAVENIR",
      logoDataUrl: "data:image/png;base64,AAA",
    });
    expect(html).toContain("nl-logo-img");
    expect(html).toContain('src="data:image/png;base64,AAA"');
    expect(html).not.toContain(">PLAZAVENIR<");
    expect(html).toContain("Lettre patrimoniale");
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

  it("omits footer contact lines when opted out", () => {
    const html = buildNewsletterHtml(
      {
        ...sampleContent,
        includeConseiller: false,
        includeFooterPhone: false,
        includeFooterSite: false,
        includeFooterAddress: false,
        includeFooterConseiller: false,
      },
      {
        cabinetName: "Cabinet Test",
        cgpPhone: "01 23 45 67 89",
        siteWeb: "https://cabinet.fr",
        postalAddress: "12 rue Test, 75002 Paris",
      }
    );
    expect(html).not.toContain("cabinet.fr");
    expect(html).not.toContain("01 23 45 67 89");
    expect(html).not.toContain("12 rue Test");
  });

  it("renders structured footer contact lines by default", () => {
    const html = buildNewsletterHtml(
      {
        ...sampleContent,
        includeConseiller: false,
        conseillerName: "Jean DUPONT",
      },
      {
        cabinetName: "Cabinet Test",
        cgpPhone: "01 23 45 67 89",
        siteWeb: "https://www.cabinet.fr",
        postalAddress: "12 rue Test, 75002 Paris",
      }
    );
    expect(html).toContain("Jean DUPONT</p>");
    expect(html).toContain("01 23 45 67 89</a> · ");
    expect(html).toContain("cabinet.fr</a>");
    expect(html).toContain("12 rue Test, 75002 Paris</p>");
    expect(html).not.toMatch(/Jean DUPONT · /);
    expect(html.match(/12 rue Test, 75002 Paris/g)?.length).toBe(1);
  });

  it("renders optional legal mentions block below CTA", () => {
    const html = buildNewsletterHtml({
      ...sampleContent,
      includeLegalMentions: true,
      legalMentions: "Les performances passées ne préjugent pas des performances futures.",
    });
    expect(html).toContain("nl-legal-text");
    expect(html).toContain("performances passées");
    const ctaIdx = html.indexOf("nl-cta-pad");
    const legalIdx = html.indexOf("nl-legal-pad");
    expect(ctaIdx).toBeGreaterThan(-1);
    expect(legalIdx).toBeGreaterThan(ctaIdx);
  });

  it("renders legal mentions below agenda button when present", () => {
    const html = buildNewsletterHtml(
      {
        ...sampleContent,
        cta: "N'attendez pas le 31 décembre pour y penser.",
        includeLegalMentions: true,
        legalMentions: "Les performances passées ne préjugent pas des performances futures.",
      },
      { agendaUrl: "https://calendly.com/test" }
    );
    const agendaIdx = html.indexOf("Prendre rendez-vous");
    const legalIdx = html.indexOf('class="nl-legal-pad"');
    expect(agendaIdx).toBeGreaterThan(-1);
    expect(legalIdx).toBeGreaterThan(agendaIdx);
  });

  it("omits legal mentions unless explicitly included", () => {
    const html = buildNewsletterHtml({
      ...sampleContent,
      legalMentions: "Mention légale cachée.",
    });
    expect(html).not.toMatch(/class="nl-legal-pad"/);
    expect(html).not.toContain("Mention légale cachée");
  });

  it("buildNewsletterPlainBodyForExport appends legal mentions", () => {
    const plain = buildNewsletterPlainBodyForExport({
      subject: "Objet",
      intro: "Intro",
      sections: [],
      cta: "RDV",
      includeLegalMentions: true,
      legalMentions: "Mention légale.",
    });
    expect(plain).toContain("RDV");
    expect(plain).toContain("Mention légale.");
  });

  it("omits conseiller block when includeConseiller is false", () => {
    const html = buildNewsletterHtml(
      {
        ...sampleContent,
        includeConseiller: false,
        conseillerName: "Jean DUPONT",
        conseillerPhone: "0612345678",
      },
      {
        cabinetName: "Cabinet Test",
        cgpPrenom: "Jean",
        cgpNom: "DUPONT",
        cgpPhone: "0612345678",
      }
    );
    expect(html).not.toContain("Votre conseiller");
    expect(html).toContain("Jean DUPONT");
  });

  it("uses edited conseiller name in HTML when block enabled", () => {
    const html = buildNewsletterHtml(
      {
        ...sampleContent,
        includeConseiller: true,
        conseillerName: "Jean DUPONT",
        conseillerPhone: "0102030405",
      },
      { cabinetName: "Cabinet Test", cgpPrenom: "Jean", cgpNom: "DUPONT" }
    );
    expect(html).toContain("Jean DUPONT");
    expect(html).toContain("0102030405");
  });

  it("omits CTA block when includeCta is false", () => {
    const html = buildNewsletterHtml(
      { ...sampleContent, includeCta: false },
      { cabinetName: "Cabinet Test" }
    );
    expect(html).not.toContain("Prendre rendez-vous");
    expect(html).not.toContain("Me répondre par email");
  });

  it("uses header text color for bandeau labels", () => {
    const html = buildNewsletterHtml(sampleContent, {
      headerColor: "#0f2744",
      headerTextColor: "#b8956a",
      editionLabel: "août 2026",
    });
    expect(html).toContain("Lettre patrimoniale");
    expect(html).toContain("color:#b8956a");
    expect(html).toContain("août 2026");
  });

  it("uses granular colors independently", () => {
    const html = buildNewsletterHtml(sampleContent, {
      headerColor: "#111111",
      titleColor: "#222222",
      separatorColor: "#333333",
      textColor: "#444444",
      buttonColor: "#555555",
      agendaUrl: "https://calendly.com/test",
    });
    expect(html).toContain("background:#111111");
    expect(html).toContain("background:#333333");
    expect(html).toContain("color:#222222");
    expect(html).toContain("color:#444444");
    expect(html).toContain("background:#555555");
  });

  it("uses secondary color in header stripe and section numbers", () => {
    const html = buildNewsletterHtml(sampleContent, {
      cabinetName: "Cabinet Test",
      separatorColor: "#ff5500",
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

  it("uses newsletter agendaLinkId when building HTML options", () => {
    const cgp = {
      wizard_completed: true,
      wizard_step: 4,
      agenda_links: [
        { id: "newsletter", label: "Newsletter", url: "https://rdv.newsletter.test" },
        { id: "suivi", label: "Suivi", url: "https://rdv.suivi.test" },
      ],
    } as import("@/lib/api/tauri-settings").CgpConfig;
    const opts = buildNewsletterHtmlOptions(cgp, { agendaLinkId: "suivi" });
    expect(opts.agendaUrl).toBe("https://rdv.suivi.test");
    const defaultOpts = buildNewsletterHtmlOptions(cgp, {});
    expect(defaultOpts.agendaUrl).toBe("https://rdv.newsletter.test");
  });

  it("includes mobile optimization classes", () => {
    const html = buildNewsletterHtml(sampleContent, {
      cabinetName: "Cabinet Test",
      agendaUrl: "https://calendly.com/test",
    });
    expect(html).toContain("nl-cta-btn");
    expect(html).toContain("nl-header-stack");
    expect(html).toContain("nl-header-text-cell");
    expect(html).not.toMatch(/nl-header-stack td \{ display: block/);
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
