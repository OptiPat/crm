import { describe, expect, it } from "vitest";
import type { Interaction } from "@/lib/api/tauri-interactions";
import type { ExchangeHistoryEntry } from "@/lib/api/tauri-interactions";
import {
  buildContactRelationTimeline,
  isLegacyCampaignInteraction,
} from "@/lib/interactions/contact-relation-timeline";
import { exchangeEntryKey } from "@/lib/interactions/exchange-history-display";

const emailEntry: ExchangeHistoryEntry = {
  entry_kind: "email_campagne",
  sort_date: 1_700_000_000,
  contact_id: 1,
  contact_nom: "DUPONT",
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
    const items = buildContactRelationTimeline([emailEntry], [legacy, manual], []);
    expect(items).toHaveLength(2);
    expect(items[0].kind).toBe("email");
    expect(items[1].kind).toBe("manual");
  });

  it("clés distinctes pour plusieurs campagnes email sur un contact", () => {
    const second = {
      ...emailEntry,
      contact_etiquette_id: 43,
      etiquette_nom: "Relance SCPI",
      sort_date: 1_690_000_000,
      sent_at: 1_690_000_000,
    };
    const items = buildContactRelationTimeline([emailEntry, second], [], []);
    const emailItems = items.filter((i) => i.kind === "email");
    expect(emailItems).toHaveLength(2);
    expect(emailItems[0].key).toBe(exchangeEntryKey(emailEntry));
    expect(emailItems[1].key).toBe(exchangeEntryKey(second));
    expect(emailItems[0].key).not.toBe(emailItems[1].key);
  });

  it("intègre une relance SMS dans la timeline contact", () => {
    const messaging: ExchangeHistoryEntry = {
      entry_kind: "messaging_relance",
      sort_date: 1_700_050_000,
      contact_id: 1,
      contact_nom: "DUPONT",
      contact_prenom: "Bruno",
      contact_etiquette_id: 42,
      etiquette_nom: "Suivi client",
      relance_canal: "sms",
      relance_canal_at: 1_700_050_000,
      relance_canal_message: "Salut Bruno, ",
      sent_at: 1_700_000_000,
    };
    const items = buildContactRelationTimeline([emailEntry, messaging], [], []);
    expect(items.map((i) => i.kind)).toEqual(["messaging", "email"]);
  });

  it("n'intègre que les investissements « avec moi » (MON_CONSEIL)", () => {
    const items = buildContactRelationTimeline([], [], [], {
      investissements: [
        {
          id: 1,
          type_produit: "PER",
          nom_produit: "PER Eres",
          versement_programme: false,
          reinvestissement_dividendes: false,
          origine: "MON_CONSEIL",
          date_souscription: 1_700_000_000,
          created_at: 1_650_000_000,
          updated_at: 1_700_000_000,
        },
        {
          id: 2,
          type_produit: "SCPI",
          nom_produit: "SCPI externe",
          versement_programme: false,
          reinvestissement_dividendes: false,
          origine: "EXISTANT_CLIENT",
          date_souscription: 1_710_000_000,
          created_at: 1_650_000_000,
          updated_at: 1_710_000_000,
        },
      ],
    });
    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe("investissement");
    if (items[0].kind === "investissement") {
      expect(items[0].investissement.id).toBe(1);
    }
  });

  it("intègre investissements, documents et tâches, triés par date décroissante", () => {
    const items = buildContactRelationTimeline([], [], [], {
      investissements: [
        {
          id: 1,
          type_produit: "PER",
          nom_produit: "PER Eres",
          versement_programme: false,
          reinvestissement_dividendes: false,
          origine: "MON_CONSEIL",
          date_souscription: 1_700_000_000,
          created_at: 1_650_000_000,
          updated_at: 1_700_000_000,
        },
      ],
      documents: [
        {
          id: 5,
          type_document: "IDENTITE",
          nom_fichier: "cni.pdf",
          chemin_fichier: "/x/cni.pdf",
          taille_fichier: 1,
          date_document: "2026-01-10",
          created_at: 1_600_000_000,
          updated_at: 1_600_000_000,
        },
      ],
      taches: [
        {
          id: 9,
          titre: "Préparer bilan",
          priorite: "NORMALE",
          statut: "A_FAIRE",
          date_echeance: 1_800_000_000,
          created_at: 1_600_000_000,
          updated_at: 1_600_000_000,
          contacts: [],
        },
      ],
    });
    expect(items.map((i) => i.kind)).toEqual([
      "tache",
      "investissement",
      "document",
    ]);
  });
});
