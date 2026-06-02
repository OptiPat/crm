import { describe, expect, it } from "vitest";
import {
  getTemplateCorpsHtml,
  htmlToPlainEmail,
  plainTextToTemplateHtml,
  setTemplateCorpsHtmlInMeta,
  buildTemplateSendBodies,
  sanitizeTemplateEmailHtml,
} from "./template-email-html";

describe("template-email-html", () => {
  it("lit et écrit corps_html dans variables JSON", () => {
    const vars = setTemplateCorpsHtmlInMeta(null, "<p>Bonjour <b>{{prenom}}</b></p>");
    expect(getTemplateCorpsHtml(vars)).toContain("{{prenom}}");
    expect(setTemplateCorpsHtmlInMeta(vars, null)).toBeNull();
  });

  it("convertit HTML en texte brut", () => {
    const plain = htmlToPlainEmail(
      "<p>Bonjour</p><p>Ligne 2</p><ul><li>Un</li><li>Deux</li></ul>"
    );
    expect(plain).toContain("Bonjour");
    expect(plain).toContain("Ligne 2");
    expect(plain).toContain("Un");
  });

  it("convertit texte brut en HTML simple", () => {
    expect(plainTextToTemplateHtml("Ligne 1\n\nLigne 2")).toContain("Ligne 1");
    expect(plainTextToTemplateHtml("Ligne 1\n\nLigne 2")).toContain("<br>");
  });

  it("envoie en HTML quand le modèle a corps_html", () => {
    const { body_html } = buildTemplateSendBodies(
      "Message.\n\n--\nSig",
      "<p>Message.</p>",
      { email_signature_html: "<p>Sig</p>", wizard_completed: true, wizard_step: 4 }
    );
    expect(body_html).toContain("<p>Message.</p>");
    expect(body_html).toContain("<p>Sig</p>");
  });

  it("sanitize retire script et garde le gras", () => {
    const out = sanitizeTemplateEmailHtml(
      '<p>OK</p><script>alert(1)</script><strong>X</strong><span style="color:red">Y</span>'
    );
    expect(out).toContain("<strong>X</strong>");
    expect(out).not.toContain("script");
    expect(out).not.toContain("style=");
  });
});
