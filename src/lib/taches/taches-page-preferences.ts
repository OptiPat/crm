import type { TachePriorite } from "@/lib/api/tauri-taches";
import type {
  TacheEcheanceFilter,
  TacheStatutFilter,
} from "@/lib/taches/tache-filters";
import { PRIORITE_META } from "@/lib/taches/tache-display";

const STORAGE_KEY = "crm_taches_page_v1";

export type TachesPagePreferences = {
  statutFilter: TacheStatutFilter;
  echeanceFilter: TacheEcheanceFilter | null;
  searchQuery: string;
  prioriteFilter: TachePriorite | "all";
  contactIdFilter: number | null;
};

const DEFAULTS: TachesPagePreferences = {
  statutFilter: "ACTIVES",
  echeanceFilter: null,
  searchQuery: "",
  prioriteFilter: "all",
  contactIdFilter: null,
};

const VALID_STATUT = new Set<string>(["ACTIVES", "FAITES", "TOUTES"]);
const VALID_ECHEANCE = new Set<string>(["overdue", "today", "week", "none", "urgent"]);
const VALID_PRIORITE = new Set<string>(["all", ...Object.keys(PRIORITE_META)]);

function sanitizePreferences(
  raw: Partial<TachesPagePreferences>
): TachesPagePreferences {
  return {
    statutFilter: VALID_STATUT.has(raw.statutFilter ?? "")
      ? (raw.statutFilter as TacheStatutFilter)
      : DEFAULTS.statutFilter,
    echeanceFilter:
      raw.echeanceFilter != null && VALID_ECHEANCE.has(raw.echeanceFilter)
        ? (raw.echeanceFilter as TacheEcheanceFilter)
        : null,
    searchQuery: typeof raw.searchQuery === "string" ? raw.searchQuery : DEFAULTS.searchQuery,
    prioriteFilter: VALID_PRIORITE.has(raw.prioriteFilter ?? "")
      ? (raw.prioriteFilter as TachePriorite | "all")
      : DEFAULTS.prioriteFilter,
    contactIdFilter:
      typeof raw.contactIdFilter === "number" && Number.isFinite(raw.contactIdFilter)
        ? raw.contactIdFilter
        : null,
  };
}

export function loadTachesPagePreferences(): TachesPagePreferences {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    return sanitizePreferences(JSON.parse(raw) as Partial<TachesPagePreferences>);
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveTachesPagePreferences(prefs: TachesPagePreferences): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

export function resetTachesPagePreferences(): TachesPagePreferences {
  return { ...DEFAULTS };
}
