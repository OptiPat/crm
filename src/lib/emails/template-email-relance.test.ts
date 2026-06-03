import { describe, expect, it } from "vitest";
import {
  buildRelanceTemplateNom,
  formatTemplateRelanceScheduleSummary,
  isTemplateEmailRelanceEnabledForQueue,
  parseTemplateEmailRelance,
  setTemplateEmailRelanceInMeta,
} from "@/lib/emails/template-email-relance";

describe("template-email-relance", () => {
  it("nomme la relance sans doubler le préfixe", () => {
    expect(buildRelanceTemplateNom("Suivi > 1 an")).toBe("Relance — Suivi > 1 an");
    expect(buildRelanceTemplateNom("Relance — client 1 an sans contact")).toBe(
      "Relance — client 1 an sans contact"
    );
    expect(buildRelanceTemplateNom("  ")).toBe("Relance");
  });

  it("active et désactive la relance dans variables", () => {
    const vars = setTemplateEmailRelanceInMeta(null, {
      enabled: true,
      delai_jours: 7,
      envoi_heure: "18:30",
      envoi_jours_semaine: null,
    });
    expect(parseTemplateEmailRelance(vars).enabled).toBe(true);
    expect(parseTemplateEmailRelance(vars).delai_jours).toBe(7);
    const off = setTemplateEmailRelanceInMeta(vars, {
      enabled: false,
      delai_jours: null,
      envoi_heure: null,
      envoi_jours_semaine: null,
    });
    expect(parseTemplateEmailRelance(off).enabled).toBe(false);
    expect(off).toContain("email_relance");
  });

  it("file d'envoi : clé absente = comportement historique", () => {
    expect(isTemplateEmailRelanceEnabledForQueue(null)).toBe(true);
    expect(
      isTemplateEmailRelanceEnabledForQueue(
        JSON.stringify({ email_relance: { enabled: false } })
      )
    ).toBe(false);
  });

  it("résume la planification relance", () => {
    expect(
      formatTemplateRelanceScheduleSummary(
        { delai_jours: 7, envoi_heure: "18:30", envoi_jours_semaine: '["MAR"]' },
        5
      )
    ).toContain("7 j");
    expect(
      formatTemplateRelanceScheduleSummary(
        { delai_jours: null, envoi_heure: null, envoi_jours_semaine: null },
        5
      )
    ).toBe("5 j après le 1er envoi");
  });
});
