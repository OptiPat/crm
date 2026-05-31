import type { ContactGmailMessage } from "@/lib/api/tauri-contact-gmail";
import type { ExchangeHistoryEntry, Interaction } from "@/lib/api/tauri-interactions";
import { getInteractionsByContact } from "@/lib/api/tauri-interactions";
import { getContactGmailMessages } from "@/lib/api/tauri-contact-gmail";
import { groupMailboxMessagesByThread } from "@/lib/contacts/contact-mail-threads";
import {
  exchangeEntryKey,
  getEmailResponseTypeLabel,
  getSentSubjectLabel,
  getSentTemplateLabel,
  isEmailCampaignEntry,
} from "@/lib/interactions/exchange-history-display";

export type RelationTimelineFilter = "all" | "crm" | "mailbox";

export type ContactRelationTimelineItem =
  | { kind: "email"; entry: ExchangeHistoryEntry; key: string; sort_date: number }
  | { kind: "manual"; interaction: Interaction; key: string; sort_date: number }
  | {
      kind: "mailbox_thread";
      threadId: string;
      messages: ContactGmailMessage[];
      latest: ContactGmailMessage;
      key: string;
      sort_date: number;
    };

/** Trace `interactions` liée à une campagne — affichée via le fil email unifié. */
export function isLegacyCampaignInteraction(item: Interaction): boolean {
  const contenu = item.contenu ?? "";
  const sujet = item.sujet ?? "";
  return (
    (contenu.startsWith("Campagne «") &&
      (contenu.includes("— email envoyé") ||
        contenu.includes("— relance email"))) ||
    contenu.startsWith("Retour enregistré après envoi") ||
    sujet.includes("— campagne «")
  );
}

export function buildContactRelationTimeline(
  emailEntries: ExchangeHistoryEntry[],
  manualInteractions: Interaction[],
  mailboxMessages: ContactGmailMessage[]
): ContactRelationTimelineItem[] {
  const threads = groupMailboxMessagesByThread(mailboxMessages);
  const items: ContactRelationTimelineItem[] = [
    ...emailEntries.map((entry) => ({
      kind: "email" as const,
      entry,
      key: exchangeEntryKey(entry),
      sort_date: entry.sort_date,
    })),
    ...manualInteractions
      .filter((i) => !isLegacyCampaignInteraction(i))
      .map((interaction) => ({
        kind: "manual" as const,
        interaction,
        key: `manual-${interaction.id}`,
        sort_date: interaction.date_interaction,
      })),
    ...threads.map((t) => ({
      kind: "mailbox_thread" as const,
      threadId: t.threadId,
      messages: t.messages,
      latest: t.latest,
      key: `thread-${t.threadId}`,
      sort_date: t.sortDate,
    })),
  ];
  return items.sort((a, b) => b.sort_date - a.sort_date);
}

export function filterRelationTimeline(
  items: ContactRelationTimelineItem[],
  filter: RelationTimelineFilter
): ContactRelationTimelineItem[] {
  if (filter === "all") return items;
  if (filter === "crm") {
    return items.filter((i) => i.kind === "email" || i.kind === "manual");
  }
  return items.filter((i) => i.kind === "mailbox_thread");
}

export function relationTimelineMatchesSearch(
  item: ContactRelationTimelineItem,
  query: string
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (item.kind === "email") {
    const hay = [
      item.entry.etiquette_nom,
      item.entry.sent_subject,
      item.entry.email_reponse_body,
      getSentTemplateLabel(item.entry),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  }
  if (item.kind === "manual") {
    const hay = [item.interaction.sujet, item.interaction.contenu]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  }
  return item.messages.some((m) => {
    let attNames = "";
    if (m.attachments_json) {
      try {
        const parsed = JSON.parse(m.attachments_json) as { name?: string }[];
        if (Array.isArray(parsed)) {
          attNames = parsed.map((a) => a.name ?? "").join(" ");
        }
      } catch {
        /* ignore */
      }
    }
    const hay = [m.subject, m.snippet, m.body_text, attNames]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
}

/** Fils unifié : campagnes CRM + notes + boîte mail (hors doublons campagne). */
export async function loadContactRelationTimeline(
  contactId: number
): Promise<ContactRelationTimelineItem[]> {
  const { getExchangeHistoryTimelineForContact } = await import(
    "@/lib/api/tauri-interactions"
  );
  const [allExchanges, manual, mailbox] = await Promise.all([
    getExchangeHistoryTimelineForContact(contactId),
    getInteractionsByContact(contactId),
    getContactGmailMessages(contactId, true),
  ]);
  const emailEntries = allExchanges.filter(
    (e) => e.contact_id === contactId && isEmailCampaignEntry(e)
  );
  return buildContactRelationTimeline(emailEntries, manual, mailbox);
}

export function emailRelationTitle(entry: ExchangeHistoryEntry): string {
  const template = getSentTemplateLabel(entry);
  const subject = getSentSubjectLabel(entry);
  if (subject) return `${template} — ${subject}`;
  return template;
}

export function emailRelationSubtitle(entry: ExchangeHistoryEntry): string | null {
  if (!entry.email_reponse_at) return null;
  return getEmailResponseTypeLabel(entry.email_reponse_type);
}
