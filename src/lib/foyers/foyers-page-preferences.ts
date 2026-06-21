import type { FoyerSortId, FoyerStatFilter } from "@/lib/foyers/foyers-search";

const STORAGE_KEY = "crm_foyers_page_v1";

export type FoyersPagePreferences = {
  searchQuery: string;
  sortId: FoyerSortId;
  statFilter: FoyerStatFilter | null;
  typeFilter: string;
  expandedFoyerId: number | null;
};

const DEFAULTS: FoyersPagePreferences = {
  searchQuery: "",
  sortId: "patrimoine_desc",
  statFilter: null,
  typeFilter: "ALL",
  expandedFoyerId: null,
};

const VALID_SORT = new Set<string>(["patrimoine_desc", "membres_desc", "name_asc"]);
const VALID_STAT = new Set<string>(["empty", "with_patrimoine", "couple"]);

function sanitizePreferences(
  raw: Partial<FoyersPagePreferences>
): FoyersPagePreferences {
  return {
    searchQuery:
      typeof raw.searchQuery === "string" ? raw.searchQuery : DEFAULTS.searchQuery,
    sortId: VALID_SORT.has(raw.sortId ?? "")
      ? (raw.sortId as FoyerSortId)
      : DEFAULTS.sortId,
    statFilter:
      raw.statFilter != null && VALID_STAT.has(raw.statFilter)
        ? (raw.statFilter as FoyerStatFilter)
        : null,
    typeFilter: typeof raw.typeFilter === "string" ? raw.typeFilter : DEFAULTS.typeFilter,
    expandedFoyerId:
      typeof raw.expandedFoyerId === "number" && Number.isFinite(raw.expandedFoyerId)
        ? raw.expandedFoyerId
        : null,
  };
}

export function loadFoyersPagePreferences(): FoyersPagePreferences {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    return sanitizePreferences(JSON.parse(raw) as Partial<FoyersPagePreferences>);
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveFoyersPagePreferences(prefs: FoyersPagePreferences): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}
