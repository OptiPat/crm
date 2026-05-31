import { describe, expect, it } from "vitest";
import {
  formatTemplatePreview,
  getInteractionOrigin,
  parseCampaignNameFromSujet,
  parseSentTemplateFromContenu,
} from "./interaction-display";

describe("interaction-display", () => {
  it("détecte une trace campagne email", () => {
    expect(
      getInteractionOrigin({
        sujet: "Réponse email — campagne « Suivi > 1 an »",
        contenu: "Retour enregistré après envoi « {{prenom}}, reprenons contact ».",
      })
    ).toBe("campaign_response");
  });

  it("parse campagne et template", () => {
    expect(
      parseCampaignNameFromSujet("Réponse email — campagne « Suivi > 1 an »")
    ).toBe("Suivi > 1 an");
    expect(
      parseSentTemplateFromContenu(
        "Retour enregistré après envoi « {{prenom}}, reprenons contact »."
      )
    ).toBe("{{prenom}}, reprenons contact");
    expect(formatTemplatePreview("{{prenom}}, test", "Nicolas")).toBe(
      "Nicolas, test"
    );
  });
});
