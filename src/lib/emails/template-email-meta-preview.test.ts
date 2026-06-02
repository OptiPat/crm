import { describe, expect, it } from "vitest";
import { renderTemplatePreview, SAMPLE_PREVIEW_CONTACT } from "@/lib/emails/template-email-meta";

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
});
