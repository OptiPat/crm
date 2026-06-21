import { describe, expect, it } from "vitest";
import type { ExchangeHistoryEntry } from "@/lib/api/tauri-interactions";
import type { EtiquetteEmailQueueItem } from "@/lib/api/tauri-etiquettes";
import {
  buildAwaitingResponseIndex,
  countExchangesByStat,
  filterExchangeHistoryList,
  isExchangeAwaitingResponse,
  isExchangeThisWeek,
} from "@/lib/interactions/exchange-history-filters";

const emailSent: ExchangeHistoryEntry = {
  entry_kind: "email_campagne",
  sort_date: 1_700_000_000,
  contact_id: 1,
  contact_nom: "DUPONT",
  contact_prenom: "Bruno",
  contact_etiquette_id: 10,
  sent_at: 1_700_000_000,
  sent_template_nom: "Relance",
};

const emailOldNoTracking: ExchangeHistoryEntry = {
  ...emailSent,
  contact_etiquette_id: 99,
  sent_at: 1_600_000_000,
};

const emailReplied: ExchangeHistoryEntry = {
  ...emailSent,
  contact_etiquette_id: 11,
  email_reponse_at: 1_700_100_000,
};

const manual: ExchangeHistoryEntry = {
  entry_kind: "manual",
  sort_date: 1_699_000_000,
  contact_id: 1,
  contact_nom: "DUPONT",
  contact_prenom: "Bruno",
  interaction_id: 5,
  type_interaction: "APPEL",
  sujet: "Rappel",
};

const sentQueueEtiquette: Pick<
  EtiquetteEmailQueueItem,
  "contact_etiquette_id" | "contact_id" | "queue_row_kind"
>[] = [{ contact_etiquette_id: 10, contact_id: 1, queue_row_kind: "etiquette" }];

describe("exchange-history-filters", () => {
  it("attendre réponse = file Envois envoyés, pas tout l'historique sans réponse", () => {
    const awaiting = buildAwaitingResponseIndex(sentQueueEtiquette);
    expect(isExchangeAwaitingResponse(emailSent, awaiting)).toBe(true);
    expect(isExchangeAwaitingResponse(emailOldNoTracking, awaiting)).toBe(false);
    expect(isExchangeAwaitingResponse(emailReplied, awaiting)).toBe(false);
    expect(isExchangeAwaitingResponse(manual, awaiting)).toBe(false);
  });

  it("pas de collision etiquette vs template sur le même id numérique", () => {
    const templateOnly = buildAwaitingResponseIndex([
      { contact_etiquette_id: 10, contact_id: 1, queue_row_kind: "template" },
    ]);
    expect(isExchangeAwaitingResponse(emailSent, templateOnly)).toBe(false);

    const etiquetteOnly = buildAwaitingResponseIndex(sentQueueEtiquette);
    expect(isExchangeAwaitingResponse(emailSent, etiquetteOnly)).toBe(true);
  });

  it("exclut une entrée historique déjà répondue même si la clé est en file", () => {
    const awaiting = buildAwaitingResponseIndex(sentQueueEtiquette);
    expect(
      isExchangeAwaitingResponse(
        { ...emailSent, email_reponse_at: 1_700_050_000 },
        awaiting
      )
    ).toBe(false);
  });

  it("compte no_reply depuis le journal chargé, aligné avec le filtre", () => {
    const awaiting = buildAwaitingResponseIndex([
      ...sentQueueEtiquette,
      { contact_etiquette_id: 20, contact_id: 2, queue_row_kind: "template" },
    ]);
    const journal = [emailSent, emailOldNoTracking, emailReplied, manual];
    const counts = countExchangesByStat(journal, awaiting);
    expect(counts.no_reply).toBe(1);
    expect(counts.email_campagne).toBe(3);
  });

  it("filtre sans réponse sur les clés actives", () => {
    const awaiting = buildAwaitingResponseIndex(sentQueueEtiquette);
    const list = filterExchangeHistoryList(
      [emailSent, emailOldNoTracking, manual],
      {
        searchQuery: "",
        typeFilter: "ALL",
        kindFilter: "all",
        statFilter: "no_reply",
        contactFilterId: null,
      },
      awaiting
    );
    expect(list).toHaveLength(1);
    expect(list[0].contact_etiquette_id).toBe(10);
  });

  it("restreint no_reply au contact filtré", () => {
    const awaiting = buildAwaitingResponseIndex(
      [
        { contact_etiquette_id: 10, contact_id: 1, queue_row_kind: "etiquette" },
        { contact_etiquette_id: 20, contact_id: 2, queue_row_kind: "etiquette" },
      ],
      2
    );
    expect(awaiting.keys.size).toBe(1);
    expect(awaiting.keys.has("etiquette:20")).toBe(true);
  });

  it("isExchangeThisWeek utilise le lundi comme début de semaine", () => {
    const wednesday = new Date("2026-06-18T10:00:00");
    const entry: ExchangeHistoryEntry = {
      ...manual,
      sort_date: Math.floor(wednesday.getTime() / 1000),
    };
    expect(isExchangeThisWeek(entry, new Date("2026-06-20T10:00:00"))).toBe(true);
  });
});
