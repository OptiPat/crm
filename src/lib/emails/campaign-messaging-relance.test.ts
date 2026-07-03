import { describe, expect, it } from "vitest";
import {
  buildCampaignMessagingRelanceGreeting,
  campaignMessagingRelanceChannelLabel,
  hasCampaignMessagingRelanceSent,
} from "@/lib/emails/campaign-messaging-relance";

describe("buildCampaignMessagingRelanceGreeting", () => {
  it("utilise Salut pour le tutoiement", () => {
    expect(buildCampaignMessagingRelanceGreeting("Jean Dupont", "TU")).toBe("Salut Jean, ");
  });

  it("utilise Bonjour pour le vouvoiement", () => {
    expect(buildCampaignMessagingRelanceGreeting("Marie Martin", "VOUS")).toBe(
      "Bonjour Marie, "
    );
  });

  it("replie sur Bonjour si registre absent", () => {
    expect(buildCampaignMessagingRelanceGreeting("Paul", null)).toBe("Bonjour Paul, ");
  });
});

describe("hasCampaignMessagingRelanceSent", () => {
  it("détecte une relance messaging enregistrée", () => {
    expect(hasCampaignMessagingRelanceSent({ relance_canal: "sms" })).toBe(true);
    expect(hasCampaignMessagingRelanceSent({ relance_canal: null })).toBe(false);
  });
});

describe("campaignMessagingRelanceChannelLabel", () => {
  it("libellé canal", () => {
    expect(campaignMessagingRelanceChannelLabel("sms")).toBe("SMS");
    expect(campaignMessagingRelanceChannelLabel("whatsapp")).toBe("WhatsApp");
    expect(campaignMessagingRelanceChannelLabel(null)).toBeNull();
  });
});
