import type { Tache, TachePriorite } from "@/lib/api/tauri-taches";
import { echeanceState, type EcheanceState } from "@/lib/taches/tache-display";
import { startOfTodayUnix } from "@/lib/taches/tache-date-shortcuts";

export type TacheStatutFilter = "ACTIVES" | "FAITES" | "TOUTES";

export type TacheEcheanceStatFilter = "overdue" | "today" | "week" | "none";

/** Filtre page (StatCards + barre notifications). */
export type TacheEcheanceFilter = TacheEcheanceStatFilter | "urgent";

export type TacheSectionId = "overdue" | "today" | "upcoming" | "none" | "done";

export const TACHE_SECTION_LABELS: Record<TacheSectionId, string> = {
  overdue: "En retard",
  today: "Aujourd'hui",
  upcoming: "À venir",
  none: "Sans date",
  done: "Terminées",
};

const DAY_SEC = 86400;

function isActive(tache: Tache): boolean {
  return tache.statut !== "FAIT";
}

/** Demain ou dans les 7 prochains jours (hors aujourd'hui). */
export function isInWeekBucket(
  dateEcheance: number | null | undefined,
  statut: Tache["statut"],
  nowMs: number = Date.now()
): boolean {
  if (dateEcheance == null || statut === "FAIT") return false;
  const today = startOfTodayUnix(nowMs);
  const tomorrow = today + DAY_SEC;
  const weekEnd = today + 7 * DAY_SEC;
  return dateEcheance >= tomorrow && dateEcheance < weekEnd;
}

export function matchesTacheEcheanceStatFilter(
  tache: Tache,
  filter: TacheEcheanceFilter,
  nowMs: number = Date.now()
): boolean {
  if (!isActive(tache)) return false;
  const state = echeanceState(tache.date_echeance, tache.statut, nowMs);
  switch (filter) {
    case "overdue":
      return state === "overdue";
    case "today":
      return state === "today";
    case "week":
      return (
        state === "tomorrow" ||
        isInWeekBucket(tache.date_echeance, tache.statut, nowMs)
      );
    case "urgent":
      return state === "overdue" || state === "today";
    case "none":
      return tache.date_echeance == null;
    default:
      return true;
  }
}

export function countTachesByEcheanceStat(
  taches: Tache[],
  nowMs: number = Date.now()
): Record<TacheEcheanceStatFilter, number> {
  const counts: Record<TacheEcheanceStatFilter, number> = {
    overdue: 0,
    today: 0,
    week: 0,
    none: 0,
  };
  for (const t of taches) {
    if (!isActive(t)) continue;
    (Object.keys(counts) as TacheEcheanceStatFilter[]).forEach((key) => {
      if (matchesTacheEcheanceStatFilter(t, key, nowMs)) counts[key] += 1;
    });
  }
  return counts;
}

export function tacheSectionId(
  tache: Tache,
  nowMs: number = Date.now()
): TacheSectionId {
  if (tache.statut === "FAIT") return "done";
  if (tache.date_echeance == null) return "none";
  const state = echeanceState(tache.date_echeance, tache.statut, nowMs);
  if (state === "overdue") return "overdue";
  if (state === "today") return "today";
  return "upcoming";
}

const ACTIVE_SECTION_ORDER: TacheSectionId[] = [
  "overdue",
  "today",
  "upcoming",
  "none",
];

export type TacheSection = {
  id: TacheSectionId;
  label: string;
  taches: Tache[];
};

export function groupTachesBySection(
  taches: Tache[],
  nowMs: number = Date.now()
): TacheSection[] {
  const buckets = new Map<TacheSectionId, Tache[]>();
  for (const id of [...ACTIVE_SECTION_ORDER, "done"] as TacheSectionId[]) {
    buckets.set(id, []);
  }
  for (const t of taches) {
    buckets.get(tacheSectionId(t, nowMs))!.push(t);
  }
  let order: TacheSectionId[];
  if (taches.some((t) => t.statut === "FAIT") && taches.some((t) => isActive(t))) {
    order = [...ACTIVE_SECTION_ORDER, "done"];
  } else if (taches.every((t) => t.statut === "FAIT")) {
    order = ["done"];
  } else {
    order = ACTIVE_SECTION_ORDER;
  }

  return order
    .map((id) => ({
      id,
      label: TACHE_SECTION_LABELS[id],
      taches: buckets.get(id) ?? [],
    }))
    .filter((s) => s.taches.length > 0);
}

export function filterTachesList(input: {
  taches: Tache[];
  statutFilter: TacheStatutFilter;
  echeanceFilter: TacheEcheanceFilter | null;
  searchQuery: string;
  prioriteFilter: TachePriorite | "all";
  contactIdFilter: number | null;
  nowMs?: number;
}): Tache[] {
  const nowMs = input.nowMs ?? Date.now();
  const q = input.searchQuery.trim().toLowerCase();

  return input.taches.filter((t) => {
    if (input.statutFilter === "ACTIVES" && t.statut === "FAIT") return false;
    if (input.statutFilter === "FAITES" && t.statut !== "FAIT") return false;

    if (
      input.echeanceFilter &&
      input.statutFilter !== "FAITES" &&
      !matchesTacheEcheanceStatFilter(t, input.echeanceFilter, nowMs)
    ) {
      return false;
    }

    if (input.prioriteFilter !== "all" && t.priorite !== input.prioriteFilter) {
      return false;
    }

    if (
      input.contactIdFilter != null &&
      !t.contacts.some((c) => c.contact_id === input.contactIdFilter)
    ) {
      return false;
    }

    if (q) {
      const hay = [
        t.titre,
        t.description ?? "",
        ...t.contacts.map((c) => `${c.prenom} ${c.nom}`),
      ]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }

    return true;
  });
}

/** Tâches urgentes pour l'encart « À traiter aujourd'hui ». */
export function pickTodayPriorityTaches(
  taches: Tache[],
  limit: number,
  nowMs: number = Date.now()
): Tache[] {
  const active = taches.filter(isActive);
  const overdue = active.filter(
    (t) => echeanceState(t.date_echeance, t.statut, nowMs) === "overdue"
  );
  const today = active.filter(
    (t) => echeanceState(t.date_echeance, t.statut, nowMs) === "today"
  );
  return [...overdue, ...today].slice(0, limit);
}

export function echeanceStateForSort(
  tache: Tache,
  nowMs: number
): EcheanceState {
  return echeanceState(tache.date_echeance, tache.statut, nowMs);
}
