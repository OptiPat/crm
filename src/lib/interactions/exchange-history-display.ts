import type { ExchangeHistoryEntry } from "@/lib/api/tauri-interactions";
import {
  formatInteractionDateTime,
  interactionContactName,
} from "@/lib/interactions/interaction-display";

/** Clé stable après fusion « un fil email par contact ». */
export function exchangeEntryKey(entry: ExchangeHistoryEntry): string {
  if (isEmailCampaignEntry(entry)) {
    return `email-contact-${entry.contact_id}`;
  }
  return `manual-${entry.interaction_id ?? `${entry.contact_id}-${entry.sort_date}`}`;
}

function pickRicherSent(
  a: ExchangeHistoryEntry,
  b: ExchangeHistoryEntry
): ExchangeHistoryEntry {
  const score = (e: ExchangeHistoryEntry) =>
    (e.contact_etiquette_id != null && e.contact_etiquette_id > 0 ? 8 : 0) +
    (e.sent_template_nom?.trim() ? 4 : 0) +
    (e.sent_subject?.trim() ? 2 : 0) +
    (e.sent_at != null && e.sent_at > 0 ? 1 : 0);
  return score(b) > score(a) ? b : a;
}

function maxTs(a?: number | null, b?: number | null): number | undefined {
  const va = a != null && a > 0 ? a : 0;
  const vb = b != null && b > 0 ? b : 0;
  const m = Math.max(va, vb);
  return m > 0 ? m : undefined;
}

/** Fusionne deux entrées pour la même clé (timeline + traces legacy). */
export function mergeExchangeEntries(
  prev: ExchangeHistoryEntry | undefined,
  next: ExchangeHistoryEntry
): ExchangeHistoryEntry {
  if (!prev) return next;
  const reponse_at = maxTs(prev.email_reponse_at, next.email_reponse_at);
  const sent_at =
    next.sent_at != null && next.sent_at > 0
      ? next.sent_at
      : prev.sent_at != null && prev.sent_at > 0
        ? prev.sent_at
        : undefined;
  return {
    ...prev,
    ...next,
    contact_nom: next.contact_nom || prev.contact_nom,
    contact_prenom: next.contact_prenom || prev.contact_prenom,
    contact_etiquette_id: next.contact_etiquette_id ?? prev.contact_etiquette_id,
    etiquette_nom: next.etiquette_nom ?? prev.etiquette_nom,
    sent_at,
    sent_subject: next.sent_subject ?? prev.sent_subject,
    sent_template_nom: next.sent_template_nom ?? prev.sent_template_nom,
    sent_body: next.sent_body ?? prev.sent_body,
    template_sujet: next.template_sujet ?? prev.template_sujet,
    template_corps: next.template_corps ?? prev.template_corps,
    template_agenda_link_id:
      next.template_agenda_link_id ?? prev.template_agenda_link_id,
    email_gmail_message_id: next.email_gmail_message_id ?? prev.email_gmail_message_id,
    email_gmail_thread_id: next.email_gmail_thread_id ?? prev.email_gmail_thread_id,
    email_reponse_at: reponse_at,
    email_reponse_type: reponse_at
      ? next.email_reponse_at === reponse_at
        ? next.email_reponse_type ?? prev.email_reponse_type
        : prev.email_reponse_type ?? next.email_reponse_type
      : undefined,
    email_reponse_body:
      (next.email_reponse_body?.trim()?.length ?? 0) >=
      (prev.email_reponse_body?.trim()?.length ?? 0)
        ? next.email_reponse_body ?? prev.email_reponse_body
        : prev.email_reponse_body ?? next.email_reponse_body,
    email_reponse_gmail_message_id:
      next.email_reponse_gmail_message_id ?? prev.email_reponse_gmail_message_id,
    sort_date: Math.max(prev.sort_date, next.sort_date, sent_at ?? 0, reponse_at ?? 0),
    interaction_id: next.interaction_id ?? prev.interaction_id,
  };
}

function hasCampaignSendEvidence(entry: ExchangeHistoryEntry): boolean {
  return (
    (entry.sent_at != null && entry.sent_at > 0) ||
    (entry.contact_etiquette_id != null && entry.contact_etiquette_id > 0) ||
    Boolean(entry.sent_template_nom?.trim()) ||
    Boolean(entry.sent_subject?.trim())
  );
}

/** Un seul fil email campagne par contact (envoi + réponse éventuelle). */
export function mergeEmailEntriesByContact(
  entries: ExchangeHistoryEntry[]
): ExchangeHistoryEntry[] {
  const manual: ExchangeHistoryEntry[] = [];
  const byContact = new Map<number, ExchangeHistoryEntry[]>();

  for (const entry of entries) {
    if (!isEmailCampaignEntry(entry)) {
      manual.push(entry);
      continue;
    }
    const list = byContact.get(entry.contact_id) ?? [];
    list.push(entry);
    byContact.set(entry.contact_id, list);
  }

  const mergedEmails: ExchangeHistoryEntry[] = [];
  for (const group of byContact.values()) {
    if (group.length === 1) {
      const only = group[0];
      if (
        only.email_reponse_at != null &&
        !hasCampaignSendEvidence(only)
      ) {
        mergedEmails.push({
          ...only,
          email_reponse_at: undefined,
          email_reponse_type: undefined,
          email_reponse_body: undefined,
        });
      } else {
        mergedEmails.push(only);
      }
      continue;
    }

    const withSent = group.filter((e) => e.sent_at != null && e.sent_at > 0);
    let sentSource =
      withSent.length > 0
        ? withSent.reduce(pickRicherSent)
        : group.reduce(pickRicherSent);

    const reponseTimes = group
      .map((e) => e.email_reponse_at)
      .filter((t): t is number => t != null && t > 0);
    const hasSentEvidence =
      withSent.length > 0 || hasCampaignSendEvidence(sentSource);
    const reponse_at =
      hasSentEvidence && reponseTimes.length > 0
        ? Math.max(...reponseTimes)
        : undefined;
    const reponseSource = group.find((e) => e.email_reponse_at === reponse_at);
    const reponseBody = group
      .map((e) => e.email_reponse_body?.trim())
      .filter((b): b is string => Boolean(b))
      .sort((a, b) => b.length - a.length)[0];
    const sentTemplateNom = group
      .map((e) => e.sent_template_nom?.trim())
      .find((n) => Boolean(n));
    const gmailThread = group
      .map((e) => e.email_gmail_thread_id?.trim())
      .find((n) => Boolean(n));
    const gmailSent = group
      .map((e) => e.email_gmail_message_id?.trim())
      .find((n) => Boolean(n));
    const gmailReponse = group
      .map((e) => e.email_reponse_gmail_message_id?.trim())
      .find((n) => Boolean(n));

    const etiquetteNoms = [
      ...new Set(
        group
          .map((e) => e.etiquette_nom?.trim())
          .filter((n): n is string => Boolean(n))
      ),
    ];

    const sort_date = Math.max(
      sentSource.sent_at ?? 0,
      reponse_at ?? 0,
      ...group.map((e) => e.sort_date)
    );

    mergedEmails.push({
      entry_kind: "email_campagne",
      sort_date,
      contact_id: sentSource.contact_id,
      contact_nom: sentSource.contact_nom,
      contact_prenom: sentSource.contact_prenom,
      contact_email: sentSource.contact_email ?? group.find((e) => e.contact_email)?.contact_email,
      contact_telephone:
        sentSource.contact_telephone ??
        group.find((e) => e.contact_telephone)?.contact_telephone,
      contact_etiquette_id: sentSource.contact_etiquette_id,
      etiquette_nom:
        etiquetteNoms.length === 1
          ? etiquetteNoms[0]
          : etiquetteNoms.length > 1
            ? etiquetteNoms.join(" · ")
            : sentSource.etiquette_nom,
      sent_at: sentSource.sent_at,
      sent_subject: sentSource.sent_subject,
      sent_body: undefined,
      sent_template_nom: sentTemplateNom ?? sentSource.sent_template_nom,
      template_sujet: sentSource.template_sujet ?? group.find((e) => e.template_sujet)?.template_sujet,
      template_corps: undefined,
      template_agenda_link_id:
        sentSource.template_agenda_link_id ??
        group.find((e) => e.template_agenda_link_id)?.template_agenda_link_id,
      email_gmail_message_id: gmailSent ?? sentSource.email_gmail_message_id,
      email_gmail_thread_id: gmailThread ?? sentSource.email_gmail_thread_id,
      email_reponse_at: reponse_at,
      email_reponse_type: reponseSource?.email_reponse_type,
      email_reponse_body: reponseBody,
      email_reponse_gmail_message_id: gmailReponse ?? reponseSource?.email_reponse_gmail_message_id,
      interaction_id: sentSource.interaction_id,
      type_interaction: "EMAIL",
      sujet: undefined,
      contenu: undefined,
      created_at: undefined,
    });
  }

  return [...mergedEmails, ...manual].sort((a, b) => b.sort_date - a.sort_date);
}

export function isEmailCampaignEntry(entry: ExchangeHistoryEntry): boolean {
  return (
    entry.entry_kind === "email_campagne" ||
    (entry.contact_etiquette_id != null && entry.contact_etiquette_id > 0)
  );
}

export function getEmailResponseTypeLabel(
  type: string | null | undefined
): string {
  switch (type) {
    case "mail":
      return "Réponse par email";
    case "rdv":
      return "RDV pris";
    case "autre":
      return "Autre retour client";
    default:
      return "Réponse client";
  }
}

/** Libellé affiché pour l'envoi campagne (nom du template, pas le corps). */
export function getSentTemplateLabel(entry: ExchangeHistoryEntry): string {
  if (entry.sent_template_nom?.trim()) {
    return entry.sent_template_nom.trim();
  }
  if (entry.etiquette_nom?.trim()) {
    return entry.etiquette_nom.trim();
  }
  return "Template email";
}

/** Sujet de l'email envoyé (rappel court, optionnel). */
export function getSentSubjectLabel(entry: ExchangeHistoryEntry): string | null {
  const s = entry.sent_subject?.trim();
  return s || null;
}

export function exchangeListTitle(entry: ExchangeHistoryEntry): string {
  if (isEmailCampaignEntry(entry)) {
    const template = getSentTemplateLabel(entry);
    const subject = getSentSubjectLabel(entry);
    if (subject) return `${template} — ${subject}`;
    return template;
  }
  return entry.sujet?.trim() || entry.contenu?.trim() || "Échange";
}

export function exchangeListSubtitle(entry: ExchangeHistoryEntry): string {
  if (isEmailCampaignEntry(entry)) {
    const sent = entry.sent_at
      ? formatInteractionDateTime(entry.sent_at)
      : "—";
    if (entry.email_reponse_at) {
      return `Envoyé ${sent} · réponse ${formatInteractionDateTime(entry.email_reponse_at)}`;
    }
    return `Envoyé ${sent}`;
  }
  return formatInteractionDateTime(entry.sort_date);
}

export function exchangeContactName(entry: ExchangeHistoryEntry): string {
  return interactionContactName(entry.contact_prenom, entry.contact_nom);
}

function parseCampaignNameFromTrace(text: string): string | undefined {
  const match = text.match(/campagne «([^»]+)»/i) ?? text.match(/Campagne «([^»]+)»/);
  return match?.[1]?.trim();
}

/** Convertit une ligne `interactions` (API historique) pour l'UI. */
export function interactionToExchangeEntry(
  row: import("@/lib/api/tauri-interactions").InteractionWithContact
): ExchangeHistoryEntry {
  const contenu = row.contenu ?? "";
  const sujet = row.sujet ?? "";
  const isSendTrace =
    contenu.startsWith("Campagne «") &&
    (contenu.includes("— email envoyé") || contenu.includes("— relance email"));
  const isResponseTrace =
    contenu.startsWith("Retour enregistré après envoi") || sujet.includes("— campagne «");

  if (isResponseTrace) {
    const etiquette_nom = parseCampaignNameFromTrace(sujet) ?? parseCampaignNameFromTrace(contenu);
    const responseType = sujet.includes("RDV") ? "rdv" : "mail";
    return {
      entry_kind: "email_campagne",
      sort_date: row.date_interaction,
      contact_id: row.contact_id,
      contact_nom: row.contact_nom,
      contact_prenom: row.contact_prenom,
      sent_at: undefined,
      sent_subject: undefined,
      sent_body: undefined,
      etiquette_nom,
      email_reponse_at: row.date_interaction,
      email_reponse_type: responseType,
      type_interaction: "EMAIL",
      interaction_id: row.id,
    };
  }

  if (isSendTrace || (row.type_interaction === "EMAIL" && contenu.length > 80)) {
    const etiquette_nom =
      parseCampaignNameFromTrace(contenu) ?? parseCampaignNameFromTrace(sujet);
    return {
      entry_kind: "email_campagne",
      sort_date: row.date_interaction,
      contact_id: row.contact_id,
      contact_nom: row.contact_nom,
      contact_prenom: row.contact_prenom,
      sent_at: row.date_interaction,
      sent_subject: row.sujet ?? undefined,
      sent_body: isSendTrace ? undefined : row.contenu,
      etiquette_nom,
      type_interaction: "EMAIL",
      interaction_id: row.id,
    };
  }

  return {
    entry_kind: "manual",
    sort_date: row.date_interaction,
    contact_id: row.contact_id,
    contact_nom: row.contact_nom,
    contact_prenom: row.contact_prenom,
    interaction_id: row.id,
    type_interaction: row.type_interaction,
    sujet: row.sujet,
    contenu: row.contenu,
    created_at: row.created_at,
  };
}

export type LoadExchangeHistoryOptions = {
  /** Charge uniquement ce contact (timeline + traces legacy filtrées). */
  contactId?: number | null;
};

/** Charge le journal : timeline `contact_etiquettes` d'abord, puis traces `interactions`. */
export async function loadExchangeHistory(
  options?: LoadExchangeHistoryOptions
): Promise<ExchangeHistoryEntry[]> {
  const contactId = options?.contactId ?? undefined;
  const {
    getAllInteractionsWithContacts,
    getExchangeHistoryTimeline,
    getExchangeHistoryTimelineForContact,
    getInteractionsByContact,
  } = await import("@/lib/api/tauri-interactions");

  const byKey = new Map<string, ExchangeHistoryEntry>();

  try {
    const timeline = contactId
      ? await getExchangeHistoryTimelineForContact(contactId)
      : await getExchangeHistoryTimeline();
    for (const t of timeline) {
      const key = exchangeEntryKey(t);
      byKey.set(key, mergeExchangeEntries(byKey.get(key), t));
    }
  } catch (error) {
    console.warn("Historique timeline indisponible:", error);
  }

  const contactNamesFromTimeline = (): { nom: string; prenom: string } => {
    const sample = Array.from(byKey.values()).find((e) => e.contact_id === contactId);
    return {
      nom: sample?.contact_nom ?? "",
      prenom: sample?.contact_prenom ?? "",
    };
  };

  if (contactId) {
    const { nom, prenom } = contactNamesFromTimeline();
    const legacyRows = await getInteractionsByContact(contactId);
    for (const row of legacyRows) {
      const entry = interactionToExchangeEntry({
        id: row.id,
        contact_id: row.contact_id,
        contact_nom: nom,
        contact_prenom: prenom,
        type_interaction: row.type_interaction,
        sujet: row.sujet,
        contenu: row.contenu,
        date_interaction: row.date_interaction,
        created_at: row.created_at,
      });
      const key = exchangeEntryKey(entry);
      byKey.set(key, mergeExchangeEntries(byKey.get(key), entry));
    }
  } else {
    const legacy = await getAllInteractionsWithContacts();
    for (const row of legacy) {
      const entry = interactionToExchangeEntry(row);
      const key = exchangeEntryKey(entry);
      byKey.set(key, mergeExchangeEntries(byKey.get(key), entry));
    }
  }

  return mergeEmailEntriesByContact(Array.from(byKey.values()));
}

export function manualEntryToInteraction(
  entry: ExchangeHistoryEntry
): import("@/lib/api/tauri-interactions").InteractionWithContact | null {
  if (entry.interaction_id == null || entry.type_interaction == null) {
    return null;
  }
  return {
    id: entry.interaction_id,
    contact_id: entry.contact_id,
    contact_nom: entry.contact_nom,
    contact_prenom: entry.contact_prenom,
    type_interaction: entry.type_interaction,
    sujet: entry.sujet ?? undefined,
    contenu: entry.contenu ?? undefined,
    date_interaction: entry.sort_date,
    created_at: entry.created_at ?? entry.sort_date,
  };
}
