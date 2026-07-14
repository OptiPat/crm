import { describe, expect, it } from "vitest";
import { renderTemplatePreview, SAMPLE_PREVIEW_CONTACT } from "@/lib/emails/template-email-meta";
import { setTemplateCorpsHtmlInMeta } from "@/lib/emails/template-email-html";

describe("renderTemplatePreview corpsHtmlOverride", () => {
  it("utilise le HTML live pour l’aperçu", () => {
    const { body_html } = renderTemplatePreview(
      "Bonjour {{prenom}}",
      "texte brut",
      SAMPLE_PREVIEW_CONTACT,
      null,
      null,
      null,
      "<p><strong>Gras</strong> pour {{prenom}}</p>"
    );
    expect(body_html).toContain("<strong>Gras</strong>");
    expect(body_html).toContain("Marie");
  });

  it("répare perf Stellium tu dans l’aperçu modèle (nom seul)", () => {
    const html = setTemplateCorpsHtmlInMeta(
      null,
      "<div>{{perf_intro_tu}}</div><div>{{perf_detail}}_tu</div>"
    );
    const tuPreview = renderTemplatePreview(
      "Performance",
      "Bonjour {{prenom}},\n\n{{perf_intro_tu}}\n\n{{perf_detail}}_tu",
      SAMPLE_PREVIEW_CONTACT,
      null,
      null,
      html,
      null,
      { templateNom: "Performance AV/PER Stellium (tu)", registre: "TU" }
    );
    expect(tuPreview.body_html ?? tuPreview.body).toContain("Ce que tu as versé");
    expect(tuPreview.body_html ?? tuPreview.body).not.toContain("_tu");

    const vousPreview = renderTemplatePreview(
      "Performance",
      "Bonjour {{prenom}} {{nom}},\n\n{{perf_intro_vous}}\n\n{{perf_detail}}_tu",
      SAMPLE_PREVIEW_CONTACT,
      null,
      null,
      html,
      null,
      { templateNom: "Performance AV/PER Stellium", registre: "VOUS" }
    );
    expect(vousPreview.body_html ?? vousPreview.body).toContain("Ce que vous avez versé");
    expect(vousPreview.body_html ?? vousPreview.body).not.toContain("_tu");
  });

  it("aperçu Box Placement : libelle_stellium et produit sans collision Stellium perf", () => {
    const preview = renderTemplatePreview(
      "{{prenom}}, {{libelle_stellium}}",
      "Opération {{libelle_stellium}} sur {{produit}}",
      SAMPLE_PREVIEW_CONTACT,
      null,
      null,
      null,
      null,
      { placementConformeTriggerEnabled: true }
    );
    expect(preview.subject).toContain("Arbitrage libre");
    expect(preview.subject).not.toContain("{{libelle_stellium}}");
    expect(preview.body).toContain("Cristalliance Evoluvie");
    expect(preview.body).not.toContain("assurance-vie - Generali");
  });
});
