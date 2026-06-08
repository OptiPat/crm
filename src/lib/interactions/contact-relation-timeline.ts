import type { ContactGmailMessage } from "@/lib/api/tauri-contact-gmail";
import type { ExchangeHistoryEntry, Interaction } from "@/lib/api/tauri-interactions";
import { getInteractionsByContact } from "@/lib/api/tauri-interactions";
import { getContactGmailMessages } from "@/lib/api/tauri-contact-gmail";
import { groupMailboxMessagesByThread } from "@/lib/contacts/contact-mail-threads";
import type { Investissement } from "@/lib/api/tauri-investissements";
import { getInvestissementsByContact } from "@/lib/api/tauri-investissements";
import type { Document } from "@/lib/api/tauri-documents";
import { getDocumentsByContact } from "@/lib/api/tauri-documents";
import type { Tache } from "@/lib/api/tauri-taches";
import { getTachesByContact } from "@/lib/api/tauri-taches";
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
    }
  | { kind: "investissement"; investissement: Investissement; key: string; sort_date: number }
  | { kind: "document"; document: Document; key: string; sort_date: number }
  | { kind: "tache"; tache: Tache; key: string; sort_date: number };

/** Événements internes CRM (hors boîte mail) — pour le filtre « CRM ». */
const CRM_KINDS = new Set([
  "email",
  "manual",
  "investissement",
  "document",
  "tache",
]);

/** Date d'un document (`date_document` texte) → timestamp Unix, sinon `created_at`. */
function documentSortDate(doc: Document): number {
  if (doc.date_document) {
    const ms = Date.parse(doc.date_document);
    if (!isNaN(ms)) return Math.floor(ms / 1000);
  }
  return doc.created_at;
}

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

export interface RelationTimelineExtras {
  investissements?: Investissement[];
  documents?: Document[];
  taches?: Tache[];
}

export function buildContactRelationTimeline(
  emailEntries: ExchangeHistoryEntry[],
  manualInteractions: Interaction[],
  mailboxMessages: ContactGmailMessage[],
  extras: RelationTimelineExtras = {}
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
    ...(extras.investissements ?? []).map((investissement) => ({
      kind: "investissement" as const,
      investissement,
      key: `investissement-${investissement.id}`,
      sort_date: investissement.date_souscription ?? investissement.created_at,
    })),
    ...(extras.documents ?? []).map((document) => ({
      kind: "document" as const,
      document,
      key: `document-${document.id}`,
      sort_date: documentSortDate(document),
    })),
    ...(extras.taches ?? []).map((tache) => ({
      kind: "tache" as const,
      tache,
      key: `tache-${tache.id}`,
      sort_date: tache.date_echeance ?? tache.created_at,
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
    return items.filter((i) => CRM_KINDS.has(i.kind));
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
  if (item.kind === "investissement") {
    const hay = [item.investissement.nom_produit, item.investissement.type_produit]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  }
  if (item.kind === "document") {
    const hay = [item.document.nom_fichier, item.document.type_document, item.document.notes]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  }
  if (item.kind === "tache") {
    const hay = [item.tache.titre, item.tache.description]
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
  const [allExchanges, manual, mailbox, investissements, documents, taches] =
    await Promise.all([
      getExchangeHistoryTimelineForContact(contactId),
      getInteractionsByContact(contactId),
      getContactGmailMessages(contactId, true),
      getInvestissementsByContact(contactId),
      getDocumentsByContact(contactId),
      getTachesByContact(contactId),
    ]);
  const emailEntries = allExchanges.filter(
    (e) => e.contact_id === contactId && isEmailCampaignEntry(e)
  );
  return buildContactRelationTimeline(emailEntries, manual, mailbox, {
    investissements,
    documents,
    taches,
  });
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
