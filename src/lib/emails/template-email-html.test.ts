import { describe, expect, it } from "vitest";
import {
  canonicalizeTemplateCorpsHtml,
  getTemplateCorpsHtml,
  htmlToPlainEmail,
  plainTextToTemplateHtml,
  normalizeTemplateEmailHtmlLikeGmail,
  setTemplateCorpsHtmlInMeta,
  buildTemplateSendBodies,
  sanitizeTemplateEmailHtml,
  prepareTemplateHtmlForSend,
  extractMessageHtmlWithoutSignature,
} from "./template-email-html";
import { buildScpiBulletinPreviewVariables } from "./scpi-bulletin-preview-vars";

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

  it("convertit texte brut en une div Gmail par ligne", () => {
    const html = plainTextToTemplateHtml("Ligne 1\n\nLigne 2");
    expect(html).toContain("Ligne 1");
    expect(html).toContain("Ligne 2");
    expect(html).toContain('line-height:1.5;margin:0;padding:0');
    expect(html).toContain("<br></div>");
    expect(html.match(/<div style=/g)?.length).toBe(3);
  });

  it("normalise comme Gmail : Entrée = div, ligne vide = div br", () => {
    const out = normalizeTemplateEmailHtmlLikeGmail(
      "<p>Intro</p><p>Suite</p><p><br></p><p>Fin</p>"
    );
    expect(out).toContain('dir="ltr"');
    expect(out).toContain("Intro");
    expect(out).toContain("Suite");
    expect(out).toContain("Fin");
    expect(out).toContain("<div style=\"line-height:1.5;margin:0;padding:0\"><br></div>");
    expect(out).not.toMatch(/<p>/);
  });

  it("envoie en HTML Gmail normalisé quand le modèle a corps_html", () => {
    const { body_html } = buildTemplateSendBodies(
      "Message.\n\n--\nSig",
      "<div>Message.</div>",
      { email_signature_html: "<p>Sig</p>", wizard_completed: true, wizard_step: 4 }
    );
    expect(body_html).toContain('dir="ltr"');
    expect(body_html).toContain('line-height:1.5;margin:0;padding:0');
    expect(body_html).toContain("Message.");
    expect(body_html).toContain("<p>Sig</p>");
  });

  it("sanitize convertit font-weight bolder en balise b", () => {
    const out = sanitizeTemplateEmailHtml(
      '<div><span style="font-weight: bolder">Gras</span> normal</div>'
    );
    expect(out).toMatch(/<b>Gras<\/b>/);
    expect(out).not.toContain("font-weight");
  });

  it("canonicalize conserve le gras après enregistrement", () => {
    const out = canonicalizeTemplateCorpsHtml(
      '<div><span style="font-weight: bolder">Important</span></div><div><br></div><div>Suite.</div>'
    );
    expect(out).toMatch(/<b>Important<\/b>/);
    expect(out).toContain("Suite.");
  });

  it("canonicalize conserve une ligne vide avant une liste", () => {
    const out = canonicalizeTemplateCorpsHtml(
      "<div>vous trouverez en :</div><div><br></div><ul><li>Mon Document</li></ul>"
    );
    const blank = '<div style="line-height:1.5;margin:0;padding:0"><br></div>';
    expect(out.indexOf("vous trouverez en :")).toBeLessThan(out.indexOf(blank));
    expect(out.indexOf(blank)).toBeLessThan(out.indexOf("<ul"));
  });

  it("sanitize retire script et garde le gras", () => {
    const out = sanitizeTemplateEmailHtml(
      '<p>OK</p><script>alert(1)</script><strong>X</strong><span style="color:red">Y</span>'
    );
    expect(out).toContain("<strong>X</strong>");
    expect(out).not.toContain("script");
    expect(out).not.toContain("style=");
  });

  it("sanitize conserve les styles Gmail sûrs sur div", () => {
    const out = sanitizeTemplateEmailHtml(
      `<div style="line-height:1.5;margin:0;padding:0">Bonjour</div>`
    );
    expect(out).toContain('style="line-height:1.5;margin:0;padding:0"');
  });

  it("sanitize conserve font-size sur span", () => {
    const out = sanitizeTemplateEmailHtml('<span style="font-size:22px">Grand</span>');
    expect(out).toContain("font-size:22px");
  });

  it("sanitize retire font-size hors plage", () => {
    const out = sanitizeTemplateEmailHtml('<span style="font-size:80px">X</span>');
    expect(out).not.toContain("font-size");
  });

  it("sanitize conserve les images de signature (data URL)", () => {
    const img =
      '<img src="data:image/png;base64,iVBORw0KGgo=" alt="Logo" width="120" height="40">';
    const out = sanitizeTemplateEmailHtml(
      `<div style="line-height:1.5;margin:0;padding:0">N° de SIREN 843139148</div>${img}`
    );
    expect(out).toContain("<img");
    expect(out).toContain("data:image/png;base64");
    expect(out).toContain('alt="Logo"');
  });

  it("prepareTemplateHtmlForSend conserve tout le HTML bulletin", () => {
    const scpiVars = buildScpiBulletinPreviewVariables();
    const corpsHtml =
      '<div dir="ltr"><div style="line-height:1.5;margin:0;padding:0">Intro {{periode}}</div><div style="line-height:1.5;margin:0;padding:0">{{bulletin_resume_html}}</div></div>';
    const out = prepareTemplateHtmlForSend(corpsHtml, scpiVars);
    expect(out).toContain("Comète");
    expect(out).toContain("Collecte nette");
    expect(out).toContain("<strong");
    expect(out).toContain("font-size:1.1em");
  });

  it("extractMessageHtmlWithoutSignature retire la signature en fin de HTML", () => {
    const signatureHtml = "<div>Sig line</div>";
    const blank = '<div style="line-height:1.5;margin:0;padding:0"><br></div>';
    const full =
      '<div dir="ltr"><div style="line-height:1.5;margin:0;padding:0">Message</div></div>' +
      blank +
      signatureHtml;
    const cgp = {
      wizard_completed: true,
      wizard_step: 4,
      email_signature: "Sig line",
      email_signature_html: signatureHtml,
    };
    const msg = extractMessageHtmlWithoutSignature(full, cgp);
    expect(msg).toContain("Message");
    expect(msg).not.toContain("Sig line");
  });
});
