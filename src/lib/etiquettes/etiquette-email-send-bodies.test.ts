import { describe, expect, it } from "vitest";
import { buildEditedHtmlEmailSendBodies } from "./etiquette-email-send-bodies";
import {
  injectTemplateSignatureHtml,
  normalizeTemplateEmailHtmlLikeGmail,
  sanitizeTemplateEmailHtml,
} from "@/lib/emails/template-email-html";

const GMAIL_BLANK = '<div style="line-height:1.5;margin:0;padding:0"><br></div>';
const LOGO_DATA =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

describe("buildEditedHtmlEmailSendBodies", () => {
  it("conserve le HTML après édition", () => {
    const html =
      '<div dir="ltr"><div style="line-height:1.5;margin:0;padding:0">Bonjour <strong>Luc</strong></div><ul style="margin:0;padding-left:1.25em;line-height:1.5"><li style="margin:0;padding:0;line-height:1.5">Point clé</li></ul></div>';
    const { body, body_html } = buildEditedHtmlEmailSendBodies(html, null);
    expect(body_html).toContain("<strong>Luc</strong>");
    expect(body_html).toContain("<ul");
    expect(body).toContain("Luc");
    expect(body).toContain("Point clé");
  });

  it("restaure le logo si seul le texte de signature est présent (sans img)", () => {
    const signatureHtml =
      `<div style="font-size:12px"><img src="${LOGO_DATA}" alt="Logo" width="120"><br>N° de SIREN 843139148<br>Inscrit à l&#39;Orias</div>`;
    const messageHtml =
      '<div dir="ltr"><div style="line-height:1.5;margin:0;padding:0">Bonjour Luc,</div></div>' +
      GMAIL_BLANK +
      '<div style="font-size:12px">N° de SIREN 843139148</div>' +
      '<div style="font-size:12px">Inscrit à l&#39;Orias</div>';
    const previewLike = normalizeTemplateEmailHtmlLikeGmail(messageHtml);
    const cgp = {
      wizard_completed: true,
      wizard_step: 4,
      email_signature: "N° de SIREN 843139148\nInscrit à l'Orias",
      email_signature_html: signatureHtml,
    };
    const { body_html } = buildEditedHtmlEmailSendBodies(previewLike, cgp);
    expect(body_html).toContain("<img");
    expect(body_html).toContain(LOGO_DATA);
    expect(body_html.match(/843139148/g)?.length).toBe(1);
  });

  it("conserve le logo signature après sanitize + envoi", () => {
    const signatureHtml =
      `<div style="font-size:12px"><img src="${LOGO_DATA}" alt="Logo" width="120"><br>N° de SIREN 843139148<br>Inscrit à l&#39;Orias</div>`;
    const messageHtml =
      '<div dir="ltr"><div style="line-height:1.5;margin:0;padding:0">Bonjour Luc,</div></div>' +
      GMAIL_BLANK +
      signatureHtml;
    const previewLike = normalizeTemplateEmailHtmlLikeGmail(
      sanitizeTemplateEmailHtml(messageHtml)
    );
    const cgp = {
      wizard_completed: true,
      wizard_step: 4,
      email_signature: "N° de SIREN 843139148\nInscrit à l'Orias",
      email_signature_html: signatureHtml,
    };
    const { body_html } = buildEditedHtmlEmailSendBodies(previewLike, cgp);
    expect(body_html).toContain("<img");
    expect(body_html).toContain(LOGO_DATA);
    expect(body_html.match(/843139148/g)?.length).toBe(1);
  });

  it("n'ajoute pas une seconde signature si les puces diffèrent (- vs •)", () => {
    const signatureHtml =
      '<div style="font-size:12px">N° de SIREN 843139148<br>Inscrit à l&#39;Orias sous le n°19000736<br>- Mandataire d&#39;intermédiaire en opérations de banque</div>';
    const messageHtml =
      '<div dir="ltr"><div style="line-height:1.5;margin:0;padding:0">Bonjour Luc,</div></div>' +
      GMAIL_BLANK +
      '<div style="font-size:12px">N° de SIREN 843139148</div>' +
      '<div style="font-size:12px">Inscrit à l&#39;Orias sous le n°19000736</div>' +
      '<div style="font-size:12px">• Mandataire d&#39;intermédiaire en opérations de banque</div>';
    const previewLike = normalizeTemplateEmailHtmlLikeGmail(
      sanitizeTemplateEmailHtml(messageHtml)
    );
    const cgp = {
      wizard_completed: true,
      wizard_step: 4,
      email_signature:
        "N° de SIREN 843139148\nInscrit à l'Orias sous le n°19000736\n- Mandataire d'intermédiaire en opérations de banque",
      email_signature_html: signatureHtml,
    };
    const { body_html } = buildEditedHtmlEmailSendBodies(previewLike, cgp);
    expect(body_html.match(/843139148/g)?.length).toBe(1);
    expect(body_html.match(/19000736/g)?.length).toBe(1);
  });

  it("n'ajoute pas une seconde signature si l'aperçu en contient déjà une", () => {
    const signatureHtml =
      '<div style="font-size:12px">N° de SIREN 843139148<br>Inscrit à l&#39;Orias</div>';
    const messageHtml =
      '<div dir="ltr"><div style="line-height:1.5;margin:0;padding:0">Bonjour Myriam,</div></div>' +
      GMAIL_BLANK +
      signatureHtml;
    const previewLike = normalizeTemplateEmailHtmlLikeGmail(
      sanitizeTemplateEmailHtml(messageHtml)
    );
    const cgp = {
      wizard_completed: true,
      wizard_step: 4,
      email_signature: "N° de SIREN 843139148\nInscrit à l'Orias",
      email_signature_html: signatureHtml,
    };
    const { body_html } = buildEditedHtmlEmailSendBodies(previewLike, cgp);
    expect(body_html.match(/843139148/g)?.length).toBe(1);
  });
});

describe("injectTemplateSignatureHtml", () => {
  it("détecte la signature après normalisation Gmail", () => {
    const signatureHtml = "<div>N° de SIREN 843139148</div>";
    const withSig =
      '<div dir="ltr"><div style="line-height:1.5;margin:0;padding:0">Message</div></div>' +
      GMAIL_BLANK +
      signatureHtml;
    const normalized = normalizeTemplateEmailHtmlLikeGmail(withSig);
    const out = injectTemplateSignatureHtml(normalized, signatureHtml);
    expect(out.match(/843139148/g)?.length).toBe(1);
  });

  it("restaure le logo même si une autre image est présente dans le corps", () => {
    const otherImg =
      "data:image/png;base64,QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVphYmNkZWZnaGlqa2xtbm9wcQ==";
    const signatureHtml =
      `<div style="font-size:12px"><img src="${LOGO_DATA}" alt="Logo" width="120"><br>N° de SIREN 843139148<br>Inscrit à l&#39;Orias</div>`;
    const messageHtml =
      '<div dir="ltr"><div style="line-height:1.5;margin:0;padding:0">Bonjour Luc,</div></div>' +
      GMAIL_BLANK +
      '<div style="font-size:12px">N° de SIREN 843139148</div>' +
      '<div style="font-size:12px">Inscrit à l&#39;Orias</div>';
    const withUnrelatedImg =
      normalizeTemplateEmailHtmlLikeGmail(messageHtml).replace(
        "Bonjour Luc,</div>",
        `Bonjour Luc,<img src="${otherImg}" alt="Autre"></div>`
      );
    const out = injectTemplateSignatureHtml(
      withUnrelatedImg,
      signatureHtml,
      "N° de SIREN 843139148\nInscrit à l'Orias"
    );
    expect(out).toContain(LOGO_DATA);
    expect(out).toContain(otherImg);
    expect(out.match(/843139148/g)?.length).toBe(1);
  });
});
