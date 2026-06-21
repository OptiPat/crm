import type { EtiquetteEmailQueueItem } from "@/lib/api/tauri-etiquettes";
import type { ExchangeHistoryEntry } from "@/lib/api/tauri-interactions";
import { isEmailCampaignEntry } from "@/lib/interactions/exchange-history-display";
import { getEtiquetteQueueItemKey } from "@/lib/etiquettes/etiquette-queue-item-key";
import { textMatchesSearch } from "@/lib/search-utils";
import { getInteractionTypeLabel } from "@/lib/interactions/interaction-display";

export type ExchangeKindFilter = "all" | "email_campagne" | "manual";

export type ExchangeStatFilter =
  | "no_reply"
  | "this_week"
  | "email_campagne"
  | "manual";

export type ExchangeHistoryFilterState = {
  searchQuery: string;
  typeFilter: string;
  kindFilter: ExchangeKindFilter;
  statFilter: ExchangeStatFilter | null;
  contactFilterId: number | null;
};

/** Campagnes actives « en attente de réponse client » (file Suivi → Envois → Envoyés). */
export type AwaitingResponseIndex = {
  /** Clés `etiquette:id` / `template:id` — pas de collision numérique. */
  keys: Set<string>;
};

function startOfWeekMondaySec(now = new Date()): number {
  const d = new Date(now);
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - diff);
  return Math.floor(d.getTime() / 1000);
}

export function isExchangeThisWeek(
  entry: ExchangeHistoryEntry,
  now = new Date()
): boolean {
  const weekStart = startOfWeekMondaySec(now);
  return entry.sort_date >= weekStart;
}

/** Clé file pour une ligne journal (toujours `contact_etiquettes`). */
export function getExchangeHistoryAwaitingKey(
  entry: ExchangeHistoryEntry
): string | null {
  const ceId = entry.contact_etiquette_id;
  if (ceId == null || ceId <= 0 || !isEmailCampaignEntry(entry)) {
    return null;
  }
  return getEtiquetteQueueItemKey({
    queue_row_kind: "etiquette",
    contact_etiquette_id: ceId,
  });
}

export function buildAwaitingResponseIndex(
  queueItems: Pick<
    EtiquetteEmailQueueItem,
    "contact_etiquette_id" | "contact_id" | "queue_row_kind"
  >[],
  contactFilterId?: number | null
): AwaitingResponseIndex {
  const scoped =
    contactFilterId != null
      ? queueItems.filter((item) => item.contact_id === contactFilterId)
      : queueItems;
  return {
    keys: new Set(scoped.map((item) => getEtiquetteQueueItemKey(item))),
  };
}

/** File Envois → Envoyés + ligne journal étiquette sans réponse enregistrée. */
export function isExchangeAwaitingResponse(
  entry: ExchangeHistoryEntry,
  awaiting: AwaitingResponseIndex
): boolean {
  const reponseAt = entry.email_reponse_at;
  if (reponseAt != null && reponseAt > 0) {
    return false;
  }
  const key = getExchangeHistoryAwaitingKey(entry);
  return key != null && awaiting.keys.has(key);
}

export function countAwaitingInJournal(
  entries: ExchangeHistoryEntry[],
  awaiting: AwaitingResponseIndex
): number {
  let count = 0;
  for (const entry of entries) {
    if (isExchangeAwaitingResponse(entry, awaiting)) count += 1;
  }
  return count;
}

export function countExchangesByStat(
  entries: ExchangeHistoryEntry[],
  awaiting?: AwaitingResponseIndex
): Record<ExchangeStatFilter, number> {
  let thisWeek = 0;
  let emailCampagne = 0;
  let manual = 0;
  for (const entry of entries) {
    if (isEmailCampaignEntry(entry)) emailCampagne += 1;
    else manual += 1;
    if (isExchangeThisWeek(entry)) thisWeek += 1;
  }
  return {
    no_reply:
      awaiting != null ? countAwaitingInJournal(entries, awaiting) : 0,
    this_week: thisWeek,
    email_campagne: emailCampagne,
    manual,
  };
}

export function matchesExchangeStatFilter(
  entry: ExchangeHistoryEntry,
  statFilter: ExchangeStatFilter | null,
  awaiting?: AwaitingResponseIndex
): boolean {
  if (statFilter == null) return true;
  switch (statFilter) {
    case "no_reply":
      return awaiting != null && isExchangeAwaitingResponse(entry, awaiting);
    case "this_week":
      return isExchangeThisWeek(entry);
    case "email_campagne":
      return isEmailCampaignEntry(entry);
    case "manual":
      return !isEmailCampaignEntry(entry);
    default:
      return true;
  }
}

export function filterExchangeHistoryList(
  entries: ExchangeHistoryEntry[],
  state: Pick<
    ExchangeHistoryFilterState,
    "searchQuery" | "typeFilter" | "kindFilter" | "statFilter" | "contactFilterId"
  >,
  awaiting?: AwaitingResponseIndex
): ExchangeHistoryEntry[] {
  return entries.filter((item) => {
    if (
      state.contactFilterId != null &&
      item.contact_id !== state.contactFilterId
    ) {
      return false;
    }
    if (
      state.kindFilter === "email_campagne" &&
      !isEmailCampaignEntry(item)
    ) {
      return false;
    }
    if (state.kindFilter === "manual" && isEmailCampaignEntry(item)) {
      return false;
    }
    if (!matchesExchangeStatFilter(item, state.statFilter, awaiting)) {
      return false;
    }
    const typeValue = isEmailCampaignEntry(item)
      ? "EMAIL"
      : item.type_interaction ?? "AUTRE";
    const matchesType =
      state.typeFilter === "ALL" || typeValue === state.typeFilter;
    const matchesSearch = textMatchesSearch(
      state.searchQuery,
      item.contact_nom,
      item.contact_prenom,
      item.sujet,
      item.contenu,
      item.sent_subject,
      item.sent_template_nom,
      item.email_reponse_body,
      item.etiquette_nom,
      getInteractionTypeLabel(typeValue)
    );
    return matchesType && matchesSearch;
  });
}
