/**
 * Caractérisation du pipeline d'espacement Gmail (évite régressions).
 */
import { describe, expect, it } from "vitest";
import { finalizeEditorHtmlForStorage } from "@/components/emails/rich-text-email-editor-utils";
import { buildEditedHtmlEmailSendBodies } from "@/lib/etiquettes/etiquette-email-send-bodies";
import {
  normalizeTemplateEmailHtmlLikeGmail,
  plainTextToTemplateHtml,
  prepareTemplateHtmlForSend,
} from "@/lib/emails/template-email-html";

const BLANK = '<div style="line-height:1.5;margin:0;padding:0"><br></div>';

function countBlankLines(html: string): number {
  return (html.match(/<div style="line-height:1\.5;margin:0;padding:0"><br><\/div>/g) ?? [])
    .length;
}

/** Simule corps bilan patrimoine (texte avec lignes vides entre paragraphes). */
const BILAN_PLAIN = `Bonjour Chloé,

J'espère que vous allez bien !

Dans le cadre du suivi de votre patrimoine, je vous propose que l'on se planifie un moment pour faire le bilan ensemble.

Ce sera l'occasion de :
analyser la trajectoire de vos investissements ;
actualiser votre dossier selon l'évolution de votre situation personnelle ou professionnelle ;
valider que la stratégie en place correspond toujours à vos priorités d'aujourd'hui.

Si de nouvelles opportunités méritent d'être étudiées par la suite, nous prendrons le temps d'en discuter.

Choisissez le créneau qui vous convient : https://calendar.app.google/example`;

describe("pipeline espacement email bilan", () => {
  it("plainTextToTemplateHtml : une ligne vide plain = un div br", () => {
    const html = plainTextToTemplateHtml(BILAN_PLAIN);
    const blanks = countBlankLines(html);
    // Paragraphes séparés par \n\n ; items liste séparés par \n seul → 5 blank divs
    expect(blanks).toBe(5);
  });

  it("double normalisation ne multiplie pas les lignes vides", () => {
    const once = normalizeTemplateEmailHtmlLikeGmail(plainTextToTemplateHtml(BILAN_PLAIN));
    const twice = normalizeTemplateEmailHtmlLikeGmail(once);
    const thrice = normalizeTemplateEmailHtmlLikeGmail(twice);
    expect(countBlankLines(once)).toBe(countBlankLines(twice));
    expect(countBlankLines(twice)).toBe(countBlankLines(thrice));
  });

  it("paragraphes p compacts → pas de div br entre eux", () => {
    const compact =
      "<p>Bonjour Chloé,</p><p>J'espère que vous allez bien !</p><p>Suite du message.</p>";
    const out = normalizeTemplateEmailHtmlLikeGmail(compact);
    expect(countBlankLines(out)).toBe(0);
  });

  it("prepareTemplateHtmlForSend + buildEditedHtml : même nombre de br div", () => {
    const stored = plainTextToTemplateHtml(BILAN_PLAIN);
    const preview = prepareTemplateHtmlForSend(stored, { prenom: "Chloé" });
    const { body_html } = buildEditedHtmlEmailSendBodies(preview, null);
    expect(countBlankLines(body_html ?? "")).toBe(countBlankLines(preview));
  });

  it("retire les br finaux contentEditable (évite double espacement Gmail)", () => {
    const editorLike =
      "<div>Bonjour,</div><div><br></div>" +
      "<div>J'espère que vous allez bien !<br></div><div><br></div>" +
      "<div><b>Ce sera l'occasion de :</b><br></div>" +
      "<ul><li>analyser la trajectoire ;<br></li><li>actualiser votre dossier ;<br></li></ul>" +
      "<div><br></div><div>Si de nouvelles opportunités…<br></div>";
    const out = normalizeTemplateEmailHtmlLikeGmail(editorLike);
    expect(out).not.toMatch(/<\/b><br>/);
    expect(out).not.toMatch(/investissements ;<br>/);
    expect(out).toContain("<ul");
    expect(out).toContain("<b>Ce sera l'occasion de :</b>");
    expect(countBlankLines(out)).toBe(2);
  });

  it("br entre divs ou trailing br : trailing br retiré, br seul = une ligne vide", () => {
    const adjacent = normalizeTemplateEmailHtmlLikeGmail("<div>A</div><div>B</div>");
    const brBetween = normalizeTemplateEmailHtmlLikeGmail("<div>A</div><br><div>B</div>");
    const trailingBr = normalizeTemplateEmailHtmlLikeGmail("<div>A<br></div><div>B</div>");
    expect(countBlankLines(adjacent)).toBe(0);
    expect(countBlankLines(brBetween)).toBe(1);
    expect(countBlankLines(trailingBr)).toBe(0);
    expect(trailingBr).not.toContain("A<br>");
  });

  it("collapse les lignes vides Gmail consécutives", () => {
    const heavy =
      "<div>A</div><br><div><br></div><br><div><br></div><div>B</div>";
    const out = normalizeTemplateEmailHtmlLikeGmail(heavy);
    expect(countBlankLines(out)).toBe(1);
  });

  it("finalizeEditorHtmlForStorage sur html Gmail preview (comme readRichTextEditorHtml)", () => {
    const preview = prepareTemplateHtmlForSend(plainTextToTemplateHtml(BILAN_PLAIN), {
      prenom: "Chloé",
    });
    const finalized = finalizeEditorHtmlForStorage(preview);
    const afterSend = buildEditedHtmlEmailSendBodies(finalized, null);
    expect(countBlankLines(finalized)).toBe(countBlankLines(preview));
    expect(countBlankLines(afterSend.body_html ?? "")).toBe(countBlankLines(preview));
  });

  it("liste plain avec ligne vide entre chaque item → blank div partout", () => {
    const plainList = `Ce sera l'occasion de :

analyser la trajectoire ;

actualiser votre dossier ;

valider la stratégie ;`;
    const html = plainTextToTemplateHtml(plainList);
    expect(countBlankLines(html)).toBe(3);
  });

  it("compacte les lignes vides autour des listes ul", () => {
    const withGaps =
      "<div>Intro</div><div><br></div>" +
      "<div><b>Ce sera l'occasion de :</b></div><div><br></div>" +
      "<ul><li>Point A</li><li>Point B</li></ul><div><br></div>" +
      "<div>Suite du message.</div>";
    const out = normalizeTemplateEmailHtmlLikeGmail(withGaps);
    expect(out).toContain("<ul");
    expect(countBlankLines(out)).toBe(1);
  });

  it("aplatit li > div (contentEditable) sans blank div supplémentaire", () => {
    const editorLike =
      "<div>Intro</div><div><br></div>" +
      "<div><b>Ce sera l'occasion de :</b></div>" +
      "<ul><li><div>analyser la trajectoire ;</div></li><li><div>actualiser ;</div></li></ul>" +
      "<div>Suite.</div>";
    const out = normalizeTemplateEmailHtmlLikeGmail(editorLike);
    expect(out).not.toMatch(/<li[^>]*><div>/);
    expect(out).toContain("analyser la trajectoire");
  });

  it("liste ul compacte : pas de blank div entre items", () => {
    const withList =
      '<div dir="ltr">' +
      '<div style="line-height:1.5;margin:0;padding:0">Ce sera l\'occasion de :</div>' +
      '<ul><li>analyser la trajectoire ;</li><li>actualiser votre dossier ;</li></ul>' +
      "</div>";
    const out = normalizeTemplateEmailHtmlLikeGmail(withList);
    expect(out).toContain("<ul");
    expect(countBlankLines(out)).toBe(0);
  });
});
