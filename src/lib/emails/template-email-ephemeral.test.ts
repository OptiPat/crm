import { describe, expect, it } from "vitest";
import {
  ephemeralSendDateTimeToUnix,
  isArchivedEphemeralTemplate,
  isEphemeralAudienceValid,
  isEphemeralTemplate,
  parseEphemeralCampaignConfig,
  setEphemeralCampaignInMeta,
  stampNewEphemeralTemplateMeta,
  unixToEphemeralSendDateLocal,
  unixToEphemeralSendTimeLocal,
} from "@/lib/emails/template-email-ephemeral";

describe("template-email-ephemeral", () => {
  it("parse une campagne éphémère", () => {
    const variables = stampNewEphemeralTemplateMeta(null);
    expect(isEphemeralTemplate(variables)).toBe(true);
    const cfg = parseEphemeralCampaignConfig(variables);
    expect(cfg?.status).toBe("draft");
    expect(cfg?.audience.categories).toEqual(["CLIENT"]);
  });

  it("masque les campagnes archivées", () => {
    const variables = setEphemeralCampaignInMeta(
      stampNewEphemeralTemplateMeta(null),
      {
        status: "archived",
        batch_key: "ephemeral-1",
        audience: {
          categories: ["CLIENT"],
          types_produit: ["SCPI"],
          noms_produit: ["Test"],
          produits_match_mode: "all",
          reinvestissement_dividendes: "inactive",
          versement_programme: "any",
        },
        excluded_contact_ids: [],
        send_at: null,
        prepared_at: null,
        archived_at: 1,
      },
      { isEphemeral: true }
    );
    expect(isArchivedEphemeralTemplate(variables)).toBe(true);
  });

  it("combine date et heure planifiées", () => {
    const ts = ephemeralSendDateTimeToUnix("2026-06-25", "19:30");
    expect(ts).not.toBeNull();
    expect(unixToEphemeralSendDateLocal(ts)).toBe("2026-06-25");
    expect(unixToEphemeralSendTimeLocal(ts)).toBe("19:30");
    expect(ephemeralSendDateTimeToUnix("")).toBeNull();
    const withDefaultTime = ephemeralSendDateTimeToUnix("2026-06-25");
    expect(unixToEphemeralSendDateLocal(withDefaultTime)).toBe("2026-06-25");
    expect(unixToEphemeralSendTimeLocal(withDefaultTime)).toBe("09:00");
  });

  it("valide l'audience produits", () => {
    expect(
      isEphemeralAudienceValid({
        categories: ["CLIENT"],
        types_produit: [],
        noms_produit: [],
        produits_match_mode: "all",
        reinvestissement_dividendes: "any",
        versement_programme: "any",
      })
    ).toBe(false);
    expect(
      isEphemeralAudienceValid({
        categories: ["CLIENT"],
        types_produit: ["SCPI"],
        noms_produit: [],
        produits_match_mode: "all",
        reinvestissement_dividendes: "any",
        versement_programme: "any",
      })
    ).toBe(true);
  });
});
