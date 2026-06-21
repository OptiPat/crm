import type { FamilleSortId, FamilleStatFilter } from "@/lib/familles/familles-search";

const STORAGE_KEY = "crm_familles_page_v1";

export type FamillesPagePreferences = {
  searchQuery: string;
  sortId: FamilleSortId;
  statFilter: FamilleStatFilter | null;
  expandedFamilleKey: string | null;
};

const DEFAULTS: FamillesPagePreferences = {
  searchQuery: "",
  sortId: "patrimoine_desc",
  statFilter: null,
  expandedFamilleKey: null,
};

const VALID_SORT = new Set<string>(["patrimoine_desc", "membres_desc", "name_asc"]);
const VALID_STAT = new Set<string>(["manual", "auto", "with_foyer"]);

function sanitizePreferences(
  raw: Partial<FamillesPagePreferences>
): FamillesPagePreferences {
  return {
    searchQuery:
      typeof raw.searchQuery === "string" ? raw.searchQuery : DEFAULTS.searchQuery,
    sortId: VALID_SORT.has(raw.sortId ?? "")
      ? (raw.sortId as FamilleSortId)
      : DEFAULTS.sortId,
    statFilter:
      raw.statFilter != null && VALID_STAT.has(raw.statFilter)
        ? (raw.statFilter as FamilleStatFilter)
        : null,
    expandedFamilleKey:
      typeof raw.expandedFamilleKey === "string" ? raw.expandedFamilleKey : null,
  };
}

export function loadFamillesPagePreferences(): FamillesPagePreferences {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    return sanitizePreferences(JSON.parse(raw) as Partial<FamillesPagePreferences>);
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveFamillesPagePreferences(prefs: FamillesPagePreferences): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}
