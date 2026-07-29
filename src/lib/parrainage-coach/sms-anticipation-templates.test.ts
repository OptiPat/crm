import { describe, expect, it } from "vitest";
import {
  availableSmsAnticipationVariants,
  renderSmsAnticipationTemplate,
  SMS_ANTICIPATION_PROFILE_DEFS,
  SMS_ANTICIPATION_PROFILES,
  SMS_ANTICIPATION_REPLY_DEFS,
  SMS_ANTICIPATION_REPLY_OPTIONS,
  SMS_ANTICIPATION_REPLY_SCENARIOS,
} from "./sms-anticipation-templates";

describe("renderSmsAnticipationTemplate", () => {
  it("remplace {{prenom}} et normalise la casse", () => {
    const text = renderSmsAnticipationTemplate("PROCHE_AMI", "A", "test");
    expect(text).toContain("Salut Test !");
    expect(text).not.toContain("{{prenom}}");
  });

  it("normalise un prénom tout en majuscules", () => {
    const text = renderSmsAnticipationTemplate("PASSE_PARTOUT", "B", "JULIE");
    expect(text).toContain("Coucou Julie !");
  });

  it("gère un prénom vide sans planter", () => {
    const text = renderSmsAnticipationTemplate("SURCHARGE", "A", "");
    expect(text).toContain("Coucou Toi !");
  });

  it("chaque profil a au moins les variantes A et B non vides", () => {
    for (const profile of SMS_ANTICIPATION_PROFILES) {
      const def = SMS_ANTICIPATION_PROFILE_DEFS[profile];
      expect(def.variants.A?.template.trim().length).toBeGreaterThan(0);
      expect(def.variants.B?.template.trim().length).toBeGreaterThan(0);
      expect(def.variants.A?.template).toContain("{{prenom}}");
      expect(def.variants.B?.template).toContain("{{prenom}}");
    }
  });

  it("les profils à 3 variantes exposent bien A, B et C", () => {
    for (const profile of [
      "PROCHE_AMI",
      "PERDU_DE_VUE",
      "SURCHARGE",
      "OPPORTUNISTE",
      "SENIOR_EXPERT",
      "PARENT_TRANSITION",
    ] as const) {
      expect(availableSmsAnticipationVariants(profile)).toEqual(["A", "B", "C"]);
    }
  });

  it("le profil passe-partout n'expose que A et B", () => {
    expect(availableSmsAnticipationVariants("PASSE_PARTOUT")).toEqual(["A", "B"]);
  });

  it("retombe sur la variante A si C n'existe pas pour le profil", () => {
    const text = renderSmsAnticipationTemplate("PASSE_PARTOUT", "C", "Julie");
    expect(text).toEqual(renderSmsAnticipationTemplate("PASSE_PARTOUT", "A", "Julie"));
  });
});

describe("SMS_ANTICIPATION_REPLY_DEFS", () => {
  it("chaque scénario a bien 3 options A, B et C non vides", () => {
    for (const scenario of SMS_ANTICIPATION_REPLY_SCENARIOS) {
      const def = SMS_ANTICIPATION_REPLY_DEFS[scenario];
      for (const option of SMS_ANTICIPATION_REPLY_OPTIONS) {
        expect(def.options[option].template.trim().length).toBeGreaterThan(0);
      }
    }
  });
});
