import { describe, expect, it } from "vitest";
import type { Interaction } from "@/lib/api/tauri-interactions";
import type { ExchangeHistoryEntry } from "@/lib/api/tauri-interactions";
import {
  buildContactRelationTimeline,
  isLegacyCampaignInteraction,
} from "@/lib/interactions/contact-relation-timeline";

const emailEntry: ExchangeHistoryEntry = {
  entry_kind: "email_campagne",
  sort_date: 1_700_000_000,
  contact_id: 1,
  contact_nom: "PLAZA",
  contact_prenom: "Bruno",
  contact_etiquette_id: 42,
  sent_template_nom: "Relance patrimoine",
  sent_at: 1_700_000_000,
};

describe("contact-relation-timeline", () => {
  it("détecte les traces campagne legacy", () => {
    expect(
      isLegacyCampaignInteraction({
        id: 1,
        contact_id: 1,
        type_interaction: "EMAIL",
        contenu: "Campagne « Suivi » — relance email (2e envoi)",
        date_interaction: 1,
        created_at: 1,
      } as Interaction)
    ).toBe(true);
    expect(
      isLegacyCampaignInteraction({
        id: 2,
        contact_id: 1,
        type_interaction: "APPEL",
        contenu: "Appel de courtoisie",
        date_interaction: 1,
        created_at: 1,
      } as Interaction)
    ).toBe(false);
  });

  it("fusionne email campagne et manuel sans doublon legacy", () => {
    const legacy: Interaction = {
      id: 10,
      contact_id: 1,
      type_interaction: "EMAIL",
      contenu: "Campagne « Suivi » — email envoyé",
      date_interaction: 1_700_000_000,
      created_at: 1_700_000_000,
    };
    const manual: Interaction = {
      id: 11,
      contact_id: 1,
      type_interaction: "APPEL",
      sujet: "Rappel",
      date_interaction: 1_699_000_000,
      created_at: 1_699_000_000,
    };
    const items = buildContactRelationTimeline([emailEntry], [legacy, manual]);
    expect(items).toHaveLength(2);
    expect(items[0].kind).toBe("email");
    expect(items[1].kind).toBe("manual");
  });
});
