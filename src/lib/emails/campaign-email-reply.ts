import type { EtiquetteEmailQueueItem } from "@/lib/api/tauri-etiquettes";
import type { ExchangeHistoryEntry } from "@/lib/api/tauri-interactions";
import { getSentSubjectLabel } from "@/lib/interactions/exchange-history-display";

/** Objet réellement envoyé (priorité) ou sujet modèle en secours. */
export function resolveCampaignReplySubjectSource(
  entry: ExchangeHistoryEntry
): string | null {
  return (
    getSentSubjectLabel(entry) ??
    entry.template_sujet?.trim() ??
    null
  );
}

/** Préfixe Re: sans doubler si déjà présent. */
export function formatCampaignReplySubject(source: string | null | undefined): string {
  const trimmed = source?.trim();
  if (!trimmed) return "Re: votre message";
  const withoutPrefix = trimmed.replace(/^(re|fwd)\s*:\s*/i, "").trim();
  return `Re: ${withoutPrefix || trimmed}`;
}

export function inferQueueRowKindFromEtiquetteNom(nom?: string | null): string {
  return nom?.trim().startsWith("Modèle ·") ? "template" : "etiquette";
}

export function defaultCampaignReplySubject(entry: ExchangeHistoryEntry): string {
  return formatCampaignReplySubject(resolveCampaignReplySubjectSource(entry));
}

/** Contexte minimal pour répondre depuis la file Suivi → Envoyés / À relancer. */
export function queueItemToExchangeReplyEntry(
  item: EtiquetteEmailQueueItem
): ExchangeHistoryEntry {
  const sentSubject =
    item.email_sent_subject?.trim() || item.template_sujet?.trim() || null;
  return {
    entry_kind: "email_campagne",
    sort_date: item.email_date_envoi ?? 0,
    contact_id: item.contact_id,
    contact_nom: item.contact_nom,
    contact_prenom: item.contact_prenom,
    contact_email: item.contact_email,
    contact_telephone: item.contact_telephone,
    contact_etiquette_id: item.contact_etiquette_id,
    etiquette_nom: item.etiquette_nom,
    sent_at: item.email_date_envoi,
    sent_subject: sentSubject,
    template_sujet: item.template_sujet,
    email_gmail_message_id: item.email_gmail_message_id ?? null,
    email_gmail_thread_id: item.email_gmail_thread_id ?? null,
  };
}
