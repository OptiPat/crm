import type { ExchangeHistoryEntry, Interaction } from "@/lib/api/tauri-interactions";
import { getInteractionsByContact } from "@/lib/api/tauri-interactions";
import {
  exchangeEntryKey,
  getEmailResponseTypeLabel,
  getSentSubjectLabel,
  getSentTemplateLabel,
  isEmailCampaignEntry,
  loadExchangeHistory,
} from "@/lib/interactions/exchange-history-display";

export type ContactRelationTimelineItem =
  | { kind: "email"; entry: ExchangeHistoryEntry; key: string }
  | { kind: "manual"; interaction: Interaction; key: string };

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

function timelineSortDate(item: ContactRelationTimelineItem): number {
  if (item.kind === "email") {
    return item.entry.sort_date;
  }
  return item.interaction.date_interaction;
}

export function buildContactRelationTimeline(
  emailEntries: ExchangeHistoryEntry[],
  manualInteractions: Interaction[]
): ContactRelationTimelineItem[] {
  const items: ContactRelationTimelineItem[] = [
    ...emailEntries.map((entry) => ({
      kind: "email" as const,
      entry,
      key: exchangeEntryKey(entry),
    })),
    ...manualInteractions
      .filter((i) => !isLegacyCampaignInteraction(i))
      .map((interaction) => ({
        kind: "manual" as const,
        interaction,
        key: `manual-${interaction.id}`,
      })),
  ];
  return items.sort((a, b) => timelineSortDate(b) - timelineSortDate(a));
}

/** Fils email campagne + échanges manuels pour un contact (même logique que Historique). */
export async function loadContactRelationTimeline(
  contactId: number
): Promise<ContactRelationTimelineItem[]> {
  const [allExchanges, manual] = await Promise.all([
    loadExchangeHistory(),
    getInteractionsByContact(contactId),
  ]);
  const emailEntries = allExchanges.filter(
    (e) => e.contact_id === contactId && isEmailCampaignEntry(e)
  );
  return buildContactRelationTimeline(emailEntries, manual);
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
