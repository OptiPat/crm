import { describe, expect, it } from "vitest";
import {
  availableSmsAnticipationVariants,
  displaySmsAnticipationSentNote,
  formatSmsAnticipationSentNote,
  renderSmsAnticipationTemplate,
  smsAnticipationProfileLabelFromSentNote,
  smsAnticipationProfileWaitingReplies,
  smsAnticipationProfileInitialReplies,
  smsAnticipationProfileReplyShowsInsisteSms,
  SMS_ANTICIPATION_PERDU_DE_VUE_INITIAL_REPLIES,
  SMS_ANTICIPATION_COACH_PROFILES,
  SMS_ANTICIPATION_PROFILE_DEFS,
  SMS_ANTICIPATION_PROFILES,
  SMS_ANTICIPATION_REPLY_DEFS,
  SMS_ANTICIPATION_REPLY_OPTIONS,
  SMS_ANTICIPATION_REPLY_SCENARIOS,
} from "./sms-anticipation-templates";

describe("renderSmsAnticipationTemplate", () => {
  it("remplace {{prenom}} et normalise la casse", () => {
    const text = renderSmsAnticipationTemplate("PROCHE_AMI", "A", "test");
    expect(text).toContain("Coucou Test !");
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

  it("chaque profil a au moins la variante A non vide", () => {
    for (const profile of SMS_ANTICIPATION_PROFILES) {
      const def = SMS_ANTICIPATION_PROFILE_DEFS[profile];
      expect(def.variants.A?.template.trim().length).toBeGreaterThan(0);
      expect(def.variants.A?.template).toContain("{{prenom}}");
    }
  });

  it("les profils standards exposent A et B", () => {
    for (const profile of [
      "PROCHE_AMI",
      "PERDU_DE_VUE",
      "SURCHARGE",
      "OPPORTUNISTE",
      "PASSE_PARTOUT",
      "SENIOR_EXPERT",
    ] as const) {
      expect(availableSmsAnticipationVariants(profile)).toEqual(["A", "B"]);
    }
  });

  it("le profil parent en transition n'expose que A", () => {
    expect(availableSmsAnticipationVariants("PARENT_TRANSITION")).toEqual(["A"]);
  });

  it("retombe sur la variante A si C n'existe pas pour le profil", () => {
    const text = renderSmsAnticipationTemplate("PASSE_PARTOUT", "C", "Julie");
    expect(text).toEqual(renderSmsAnticipationTemplate("PASSE_PARTOUT", "A", "Julie"));
  });
});

describe("SMS_ANTICIPATION_COACH_PROFILES", () => {
  it("n'affiche que proche / ami et perdu de vue dans le coach", () => {
    expect(SMS_ANTICIPATION_COACH_PROFILES).toEqual(["PROCHE_AMI", "PERDU_DE_VUE"]);
  });
});

describe("formatSmsAnticipationSentNote", () => {
  it("persiste et restitue le profil pour l'affichage attente de réponse", () => {
    const raw = formatSmsAnticipationSentNote(
      "PROCHE_AMI",
      "A",
      "Coucou Julie ! Comment ça va ?"
    );
    expect(smsAnticipationProfileLabelFromSentNote(raw)).toBe("🤝 Proche / Ami");
    expect(displaySmsAnticipationSentNote(raw)).toBe("Coucou Julie ! Comment ça va ?");
  });
});

describe("SMS_ANTICIPATION_PROFILE_WAITING_REPLIES", () => {
  it("expose 4 relances pour le profil proche / ami", () => {
    const replies = smsAnticipationProfileWaitingReplies("PROCHE_AMI");
    expect(replies?.map((r) => r.label)).toEqual([
      "Frustration",
      "Tiède",
      "Esquive",
      "Positif",
    ]);
    expect(replies?.[0]?.template).toContain("Ah mince...");
    expect(replies?.find((r) => r.id === "TIEDE")?.followUp?.template).toContain(
      "Faut qu'on s'appelle 5 min que tu me racontes ça"
    );
  });

  it("perdu de vue a 4 relances propres (frustration, positif, curieux, tiède)", () => {
    const replies = smsAnticipationProfileWaitingReplies("PERDU_DE_VUE");
    expect(replies?.map((r) => r.label)).toEqual([
      "Frustration",
      "Curieux",
      "Tiède",
      "Positif",
    ]);
    expect(replies?.[0]?.template).toContain("c'est pas évident");
    expect(replies?.find((r) => r.id === "CURIEUX")?.template).toContain(
      "je te raconte pas tout par écrit"
    );
    expect(smsAnticipationProfileReplyShowsInsisteSms("PERDU_DE_VUE", "POSITIF")).toBe(true);
    expect(smsAnticipationProfileReplyShowsInsisteSms("PERDU_DE_VUE", "FRUSTRATION")).toBe(false);
    expect(smsAnticipationProfileReplyShowsInsisteSms("PROCHE_AMI", "POSITIF")).toBe(true);
    expect(smsAnticipationProfileReplyShowsInsisteSms("PROCHE_AMI", "TIEDE")).toBe(false);
  });
});

describe("SMS_ANTICIPATION_PERDU_DE_VUE_INITIAL_REPLIES", () => {
  it("expose 3 relances selon la situation pro", () => {
    expect(SMS_ANTICIPATION_PERDU_DE_VUE_INITIAL_REPLIES.map((r) => r.label)).toEqual([
      "Même boîte",
      "A changé",
      "En recherche",
    ]);
    expect(smsAnticipationProfileInitialReplies("PERDU_DE_VUE")).toBe(
      SMS_ANTICIPATION_PERDU_DE_VUE_INITIAL_REPLIES
    );
    expect(smsAnticipationProfileInitialReplies("PROCHE_AMI")).toBeNull();
    expect(SMS_ANTICIPATION_PERDU_DE_VUE_INITIAL_REPLIES[0].template).toContain(
      "tu te plais toujours autant"
    );
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
