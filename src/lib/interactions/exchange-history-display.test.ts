import { describe, expect, it } from "vitest";
import {
  exchangeEntryKey,
  isEmailCampaignEntry,
  mergeEmailEntriesByContact,
  getSentTemplateLabel,
  exchangeListTitle,
} from "@/lib/interactions/exchange-history-display";
import type { ExchangeHistoryEntry } from "@/lib/api/tauri-interactions";

const emailEntry: ExchangeHistoryEntry = {
  entry_kind: "email_campagne",
  sort_date: 1_700_000_000,
  contact_id: 1,
  contact_nom: "DUPONT",
  contact_prenom: "Bruno",
  contact_etiquette_id: 42,
  etiquette_nom: "Campagne test",
  sent_at: 1_700_000_000,
  sent_subject: "Bonjour Bruno",
  sent_template_nom: "Relance patrimoine",
  email_reponse_at: 1_700_010_000,
  email_reponse_type: "mail",
};

describe("exchange-history-display", () => {
  it("détecte un fil email campagne", () => {
    expect(isEmailCampaignEntry(emailEntry)).toBe(true);
    expect(
      isEmailCampaignEntry({ ...emailEntry, entry_kind: "manual" })
    ).toBe(true);
  });

  it("une clé par campagne email (contact_etiquette)", () => {
    expect(exchangeEntryKey(emailEntry)).toBe("email-ce-42");
    expect(
      exchangeEntryKey({ ...emailEntry, contact_etiquette_id: 99, contact_id: 1 })
    ).toBe("email-ce-99");
    expect(exchangeEntryKey({ ...emailEntry, contact_id: 2 })).toBe("email-ce-42");
  });

  it("clés distinctes pour deux campagnes du même contact", () => {
    const a = exchangeEntryKey(emailEntry);
    const b = exchangeEntryKey({
      ...emailEntry,
      contact_etiquette_id: 43,
      etiquette_nom: "Autre campagne",
    });
    expect(a).not.toBe(b);
  });

  it("fusionne envoi + trace réponse pour un même contact", () => {
    const send: ExchangeHistoryEntry = {
      ...emailEntry,
      sent_at: 1_700_000_000,
      sent_subject: "Bruno, reprenons contact",
      sent_body: "Corps envoyé",
      email_reponse_at: undefined,
      email_reponse_type: undefined,
    };
    const responseOnly: ExchangeHistoryEntry = {
      ...emailEntry,
      sent_at: undefined,
      sent_subject: undefined,
      sent_body: undefined,
      email_reponse_at: 1_700_010_000,
      email_reponse_type: "mail",
      etiquette_nom: "Suivi > 1 an",
    };
    const merged = mergeEmailEntriesByContact([send, responseOnly]);
    expect(merged).toHaveLength(1);
    expect(merged[0].sent_subject).toBe("Bruno, reprenons contact");
    expect(merged[0].email_reponse_at).toBe(1_700_010_000);
  });

  it("pas de réponse affichée sans envoi enregistré", () => {
    const orphan: ExchangeHistoryEntry = {
      ...emailEntry,
      contact_etiquette_id: undefined,
      sent_at: undefined,
      sent_template_nom: undefined,
      sent_subject: undefined,
      etiquette_nom: undefined,
      email_reponse_at: 1_700_010_000,
      email_reponse_type: "mail",
    };
    const merged = mergeEmailEntriesByContact([orphan]);
    expect(merged[0].email_reponse_at).toBeUndefined();
  });

  it("garde la réponse si contact_etiquette_id (envoi campagne en base)", () => {
    const withCe: ExchangeHistoryEntry = {
      ...emailEntry,
      sent_at: undefined,
      sent_template_nom: "Relance patrimoine",
      email_reponse_at: 1_700_010_000,
      email_reponse_type: "mail",
      email_reponse_body: "top",
    };
    const merged = mergeEmailEntriesByContact([withCe]);
    expect(merged[0].email_reponse_at).toBe(1_700_010_000);
    expect(merged[0].email_reponse_body).toBe("top");
  });

  it("mergeExchangeEntries combine envoi timeline et trace réponse legacy", async () => {
    const { mergeExchangeEntries } = await import(
      "@/lib/interactions/exchange-history-display"
    );
    const timeline = {
      ...emailEntry,
      email_reponse_at: undefined,
      email_reponse_type: undefined,
    };
    const legacyResponse = {
      ...emailEntry,
      sent_at: undefined,
      sent_subject: undefined,
      sent_template_nom: undefined,
      email_reponse_at: 1_700_010_000,
      email_reponse_type: "mail" as const,
    };
    const merged = mergeExchangeEntries(timeline, legacyResponse);
    expect(merged.sent_at).toBe(1_700_000_000);
    expect(merged.email_reponse_at).toBe(1_700_010_000);
  });

  it("affiche le nom du template, pas le corps", () => {
    expect(getSentTemplateLabel(emailEntry)).toBe("Relance patrimoine");
    expect(exchangeListTitle(emailEntry)).toContain("Relance patrimoine");
    expect(exchangeListTitle(emailEntry)).toContain("Bonjour Bruno");
  });

  it("fusionne le corps de réponse le plus long", () => {
    const send: ExchangeHistoryEntry = {
      ...emailEntry,
      email_reponse_at: undefined,
      email_reponse_body: undefined,
    };
    const responseOnly: ExchangeHistoryEntry = {
      ...emailEntry,
      sent_at: undefined,
      sent_template_nom: undefined,
      email_reponse_at: 1_700_010_000,
      email_reponse_body: "Merci pour votre message, je suis disponible mardi.",
    };
    const merged = mergeEmailEntriesByContact([send, responseOnly]);
    expect(merged[0].email_reponse_body).toContain("disponible mardi");
  });

  it("tronque le journal global après fusion", async () => {
    const { truncateExchangeHistory } = await import(
      "@/lib/interactions/exchange-history-display"
    );
    const entries = Array.from({ length: 500 }, (_, i) => ({
      ...emailEntry,
      sort_date: 500 - i,
      contact_id: i + 1,
    }));
    const truncated = truncateExchangeHistory(entries, 400);
    expect(truncated).toHaveLength(400);
    expect(truncated[0].sort_date).toBe(500);
  });
});
