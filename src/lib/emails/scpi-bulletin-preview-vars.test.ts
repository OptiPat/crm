import { describe, expect, it } from "vitest";
import {
  buildScpiBulletinPreviewVariables,
  parseScpiCampaignVariables,
  templateUsesScpiBulletinVariables,
} from "@/lib/emails/scpi-bulletin-preview-vars";
import { renderTemplatePreview } from "@/lib/emails/template-email-meta";
import { setTemplateCorpsHtmlInMeta } from "@/lib/emails/template-email-html";

describe("scpi bulletin preview vars", () => {
  it("détecte les variables bulletin dans le modèle", () => {
    expect(
      templateUsesScpiBulletinVariables(
        "Sujet {{periode}}",
        "Intro\n{{bulletin_resume_html}}\nFin"
      )
    ).toBe(true);
    expect(templateUsesScpiBulletinVariables("Bonjour {{prenom}}")).toBe(false);
  });

  it("parse campaign_variables", () => {
    const vars = parseScpiCampaignVariables(
      JSON.stringify({
        periode: "T1 2026",
        bulletin_resume: "## Comète\n\n- Collecte : 132 M€",
      })
    );
    expect(vars.periode).toBe("T1 2026");
    expect(vars.scpi_intro_tu).toContain("ta SCPI");
    expect(vars.bulletin_resume).not.toMatch(/## Comète — T1 2026/);
  });

  it("injecte un exemple dans l'aperçu modèle SCPI", () => {
    const corpsHtml =
      '<div dir="ltr"><div style="line-height:1.5;margin:0;padding:0">{{bulletin_resume_html}}</div></div>';
    const { body_html } = renderTemplatePreview(
      "Bulletins {{periode}}",
      "Intro {{bulletin_resume}}",
      {
        prenom: "Marie",
        nom: "Dupont",
        email: "m.dupont@example.com",
        telephone: "0612345678",
      },
      null,
      null,
      setTemplateCorpsHtmlInMeta(null, corpsHtml),
      corpsHtml
    );
    expect(body_html).toContain("Collecte nette");
    expect(body_html).not.toContain("## Comète");
  });

  it("utilise ta SCPI au singulier dans l'aperçu modèle", () => {
    const corpsHtml =
      '<div dir="ltr"><div style="line-height:1.5;margin:0;padding:0">{{scpi_intro_tu}} (<strong>{{periode}}</strong>) :</div></div>';
    const { body_html } = renderTemplatePreview(
      "Bulletins {{periode}}",
      "{{scpi_intro_tu}} ({{periode}}) :",
      {
        prenom: "Marie",
        nom: "Dupont",
        email: "m.dupont@example.com",
        telephone: "0612345678",
      },
      null,
      null,
      setTemplateCorpsHtmlInMeta(null, corpsHtml),
      corpsHtml
    );
    expect(body_html).toContain("bulletin trimestriel de ta SCPI");
  });

  it("buildScpiBulletinPreviewVariables produit du HTML", () => {
    const vars = buildScpiBulletinPreviewVariables();
    expect(vars.bulletin_resume_html).toContain("Collecte nette");
    expect(vars.scpi_intro_tu).toContain("ta SCPI");
  });
});
