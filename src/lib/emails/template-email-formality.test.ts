import { describe, expect, it } from "vitest";
import {
  buildTutoiementTemplateNom,
  isContactTu,
  normalizeContactRegistre,
  pickTemplateContentForRegistre,
} from "@/lib/emails/template-email-formality";

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
});
