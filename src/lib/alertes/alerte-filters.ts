import type { AlerteWithContact } from "@/lib/api/tauri-dashboard";
import type { EtiquetteWithCount } from "@/lib/api/tauri-etiquettes";
import type { Tache } from "@/lib/api/tauri-taches";
import {
  matchesAlerteCategoryFilter,
  type AlerteCategoryFilter,
} from "@/lib/alertes/alerte-category";
import { alerteHasActiveEmailCampaign } from "@/lib/alertes/alerte-email-queue";
import { suiviAlerteToRef } from "@/lib/suivi/suivi-alerte-ref";

const SECONDS_PER_DAY = 86400;

function parseAlerteTimestamp(dateAlerte: string | number): number | null {
  const ts =
    typeof dateAlerte === "string" ? parseInt(dateAlerte, 10) : dateAlerte;
  return Number.isFinite(ts) && ts > 0 ? ts : null;
}

export type AlerteUrgencyStatFilter = "plus30" | "plus7" | "recent";

export type AlerteSortMode = "days_desc" | "days_asc" | "name" | "type";

export type AlerteViewMode = "detailed" | "compact";

export type AlerteSectionId = "priority" | "attention" | "recent";

export const ALERTE_SECTION_LABELS: Record<AlerteSectionId, string> = {
  priority: "Prioritaires (+30 j)",
  attention: "À surveiller (+7 j)",
  recent: "Récentes (< 7 j)",
};

const SECTION_ORDER: AlerteSectionId[] = ["priority", "attention", "recent"];

export function getAlerteDaysOpen(
  alerte: AlerteWithContact,
  nowSec: number = Math.floor(Date.now() / 1000)
): number {
  const createdTs = parseAlerteTimestamp(alerte.date_alerte);
  if (createdTs == null) return 0;
  return Math.max(0, Math.floor((nowSec - createdTs) / SECONDS_PER_DAY));
}

export function alerteSectionId(
  alerte: AlerteWithContact,
  nowSec: number = Math.floor(Date.now() / 1000)
): AlerteSectionId {
  const days = getAlerteDaysOpen(alerte, nowSec);
  if (days >= 30) return "priority";
  if (days >= 7) return "attention";
  return "recent";
}

export function matchesAlerteUrgencyFilter(
  alerte: AlerteWithContact,
  filter: AlerteUrgencyStatFilter,
  nowSec: number = Math.floor(Date.now() / 1000)
): boolean {
  const days = getAlerteDaysOpen(alerte, nowSec);
  switch (filter) {
    case "plus30":
      return days >= 30;
    case "plus7":
      return days >= 7 && days < 30;
    case "recent":
      return days < 7;
    default:
      return true;
  }
}

export function countAlertesByUrgency(
  alertes: AlerteWithContact[],
  nowSec: number = Math.floor(Date.now() / 1000)
): Record<AlerteUrgencyStatFilter, number> {
  const counts: Record<AlerteUrgencyStatFilter, number> = {
    plus30: 0,
    plus7: 0,
    recent: 0,
  };
  for (const a of alertes) {
    (Object.keys(counts) as AlerteUrgencyStatFilter[]).forEach((key) => {
      if (matchesAlerteUrgencyFilter(a, key, nowSec)) counts[key] += 1;
    });
  }
  return counts;
}

function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

export function matchesAlerteSearch(
  alerte: AlerteWithContact,
  searchQuery: string
): boolean {
  const q = normalizeSearch(searchQuery);
  if (!q) return true;
  const haystack = normalizeSearch(
    `${alerte.contact_prenom} ${alerte.contact_nom} ${alerte.message}`
  );
  return haystack.includes(q);
}

export function filterAlertes(
  alertes: AlerteWithContact[],
  opts: {
    categoryFilter: AlerteCategoryFilter;
    urgencyFilter: AlerteUrgencyStatFilter | null;
    searchQuery: string;
    nowSec?: number;
  }
): AlerteWithContact[] {
  const nowSec = opts.nowSec ?? Math.floor(Date.now() / 1000);
  return alertes.filter(
    (a) =>
      matchesAlerteCategoryFilter(a.type_alerte, opts.categoryFilter) &&
      (opts.urgencyFilter == null ||
        matchesAlerteUrgencyFilter(a, opts.urgencyFilter, nowSec)) &&
      matchesAlerteSearch(a, opts.searchQuery)
  );
}

function contactSortKey(alerte: AlerteWithContact): string {
  return `${alerte.contact_nom} ${alerte.contact_prenom}`.trim().toLowerCase();
}

export function sortAlertes(
  alertes: AlerteWithContact[],
  sortMode: AlerteSortMode,
  nowSec: number = Math.floor(Date.now() / 1000)
): AlerteWithContact[] {
  const sorted = [...alertes];
  sorted.sort((a, b) => {
    switch (sortMode) {
      case "days_desc":
        return getAlerteDaysOpen(b, nowSec) - getAlerteDaysOpen(a, nowSec);
      case "days_asc":
        return getAlerteDaysOpen(a, nowSec) - getAlerteDaysOpen(b, nowSec);
      case "name":
        return contactSortKey(a).localeCompare(contactSortKey(b), "fr");
      case "type":
        return (
          a.type_alerte.localeCompare(b.type_alerte, "fr") ||
          contactSortKey(a).localeCompare(contactSortKey(b), "fr")
        );
      default:
        return 0;
    }
  });
  return sorted;
}

export type AlerteSection = {
  id: AlerteSectionId;
  label: string;
  alertes: AlerteWithContact[];
};

export function groupAlertesBySection(
  alertes: AlerteWithContact[],
  nowSec: number = Math.floor(Date.now() / 1000)
): AlerteSection[] {
  const buckets = new Map<AlerteSectionId, AlerteWithContact[]>();
  for (const id of SECTION_ORDER) buckets.set(id, []);
  for (const a of alertes) {
    buckets.get(alerteSectionId(a, nowSec))!.push(a);
  }
  return SECTION_ORDER.map((id) => ({
    id,
    label: ALERTE_SECTION_LABELS[id],
    alertes: buckets.get(id)!,
  })).filter((s) => s.alertes.length > 0);
}

export function countAlertesWithEmailCampaign(
  alertes: AlerteWithContact[],
  etiquettes: EtiquetteWithCount[]
): number {
  let n = 0;
  for (const a of alertes) {
    if (alerteHasActiveEmailCampaign(suiviAlerteToRef(a), etiquettes)) n += 1;
  }
  return n;
}

/** Contacts ayant au moins une tâche active (A_FAIRE). */
export function buildContactIdsWithActiveTaches(taches: Tache[]): Set<number> {
  const ids = new Set<number>();
  for (const t of taches) {
    if (t.statut === "FAIT") continue;
    for (const c of t.contacts ?? []) ids.add(c.contact_id);
  }
  return ids;
}

export function findNextAlerteInList(
  alertes: AlerteWithContact[],
  currentId: number
): AlerteWithContact | null {
  const idx = alertes.findIndex((a) => a.alerte_id === currentId);
  if (idx < 0) return alertes[0] ?? null;
  return alertes[idx + 1] ?? null;
}
