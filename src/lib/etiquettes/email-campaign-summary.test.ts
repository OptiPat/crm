import { describe, expect, it } from "vitest";
import { formatEmailCampaignSummary } from "@/lib/etiquettes/email-campaign-summary";

const template = {
  id: 1,
  nom: "Rappel IR",
  categorie: "FISCALITE",
  sujet: "s",
  corps: "c",
  variables: null,
  agenda_link_id: null,
  relance_template_id: null,
  created_at: 0,
  updated_at: 0,
};

describe("formatEmailCampaignSummary", () => {
  it("campagnes désactivée", () => {
    expect(
      formatEmailCampaignSummary({
        active: false,
        template: null,
        mode: "eligibility",
        envoiHeure: "09:00",
        envoiLocal: "",
        emailDelaiJours: 0,
        hasAutoRule: true,
        etiquetteNom: "IR",
      })
    ).toContain("désactivée");
  });

  it("éligibilité avec règle auto", () => {
    const s = formatEmailCampaignSummary({
      active: true,
      template,
      mode: "eligibility",
      envoiHeure: "10:30",
      envoiLocal: "",
      emailDelaiJours: 1,
      hasAutoRule: true,
      etiquetteNom: "Déclaration IR",
      isEventSouscription: true,
    });
    expect(s).toContain("1 jour");
    expect(s).toContain("10:30");
    expect(s).toContain("Déclaration IR");
  });
});
