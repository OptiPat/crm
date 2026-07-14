import { describe, expect, it } from "vitest";
import {
  buildTutoiementTemplateNom,
  isContactTu,
  normalizeContactRegistre,
  pickTemplateContentForRegistre,
  pickTemplateVariablesForRegistre,
} from "@/lib/emails/template-email-formality";
import { setTemplateEmailAttachmentsInMeta } from "@/lib/emails/template-email-attachments";

describe("template-email-formality", () => {
  it("normalise le registre", () => {
    expect(normalizeContactRegistre("tu")).toBe("TU");
    expect(normalizeContactRegistre("VOUS")).toBe("VOUS");
    expect(normalizeContactRegistre(null)).toBe("VOUS");
  });

  it("construit le nom du modèle lié", () => {
    expect(buildTutoiementTemplateNom("Relance annuelle")).toBe(
      "Relance annuelle (tu)"
    );
    expect(buildTutoiementTemplateNom("Relance (tu)")).toBe("Relance (tu)");
  });

  it("choisit la variante tu quand le contact est en tutoiement", () => {
    const vous = { sujet: "Bonjour", corps: "Je vous propose" };
    const tu = { sujet: "Salut", corps: "Je te propose" };
    expect(pickTemplateContentForRegistre(vous, tu, "TU").corps).toBe(
      "Je te propose"
    );
    expect(pickTemplateContentForRegistre(vous, tu, "VOUS").corps).toBe(
      "Je vous propose"
    );
    expect(pickTemplateContentForRegistre(vous, null, "TU").corps).toBe(
      "Je vous propose"
    );
  });

  it("détecte le tutoiement", () => {
    expect(isContactTu("TU")).toBe(true);
    expect(isContactTu("VOUS")).toBe(false);
  });

  it("choisit les variables (PJ) selon le registre", () => {
    const principal = setTemplateEmailAttachmentsInMeta(null, [
      {
        id: "a1",
        template_id: 1,
        filename: "vous.pdf",
        mime_type: "application/pdf",
        stored_name: "vous.pdf",
        size_bytes: 100,
      },
    ]);
    const tu = setTemplateEmailAttachmentsInMeta(null, [
      {
        id: "a2",
        template_id: 2,
        filename: "tu.pdf",
        mime_type: "application/pdf",
        stored_name: "tu.pdf",
        size_bytes: 200,
      },
    ]);
    expect(pickTemplateVariablesForRegistre(principal, tu, "TU", true)).toBe(tu);
    expect(pickTemplateVariablesForRegistre(principal, tu, "VOUS", true)).toBe(principal);
    expect(pickTemplateVariablesForRegistre(principal, null, "TU", true)).toBe(null);
    expect(pickTemplateVariablesForRegistre(principal, null, "TU", false)).toBe(principal);
  });
});
