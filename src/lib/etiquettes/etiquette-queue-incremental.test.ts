import { describe, expect, it } from "vitest";
import {
  applyIncrementalEmailSent,
  buildSentQueueItem,
} from "./etiquette-queue-incremental";
import type { EtiquetteEmailQueueItem } from "@/lib/api/tauri-etiquettes";

const base: EtiquetteEmailQueueItem = {
  contact_etiquette_id: 42,
  contact_id: 7,
  contact_nom: "Dupont",
  contact_prenom: "Marie",
  contact_email: "m@example.com",
  contact_telephone: null,
  etiquette_id: 1,
  etiquette_nom: "Suivi",
  etiquette_couleur: "#000",
  email_date_prevue: null,
  email_date_envoi: null,
  template_sujet: "Objet",
  template_corps: "Corps",
  template_agenda_link_id: null,
  queue_issue: null,
};

describe("etiquette-queue-incremental", () => {
  it("déplace une ligne de prêts vers envoyés", () => {
    const sentAt = 1_700_000_000;
    const sentItem = buildSentQueueItem(base, sentAt, "Objet final");
    const next = applyIncrementalEmailSent(
      { ready: [base, { ...base, contact_etiquette_id: 99 }], scheduled: [], sent: [] },
      42,
      sentItem
    );
    expect(next.ready).toHaveLength(1);
    expect(next.ready[0].contact_etiquette_id).toBe(99);
    expect(next.sent[0].contact_etiquette_id).toBe(42);
    expect(next.sent[0].email_date_envoi).toBe(sentAt);
    expect(next.sent[0].template_sujet).toBe("Objet final");
    expect(next.sent[0].email_sent_subject).toBe("Objet final");
  });

  it("conserve les identifiants Gmail pour une réponse immédiate", () => {
    const sentItem = buildSentQueueItem(
      { ...base, email_gmail_message_id: null, email_gmail_thread_id: null },
      1_700_000_000,
      {
        subject: "Objet final",
        gmailMessageId: "msg-42",
        gmailThreadId: "thread-9",
      }
    );
    expect(sentItem.email_gmail_message_id).toBe("msg-42");
    expect(sentItem.email_gmail_thread_id).toBe("thread-9");
  });
});
