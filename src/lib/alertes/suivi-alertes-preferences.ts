import type { AlerteCategoryFilter } from "@/lib/alertes/alerte-category";
import type {
  AlerteSortMode,
  AlerteUrgencyStatFilter,
  AlerteViewMode,
} from "@/lib/alertes/alerte-filters";

const STORAGE_KEY = "crm_suivi_alertes_v1";

export type SuiviAlertesPreferences = {
  categoryFilter: AlerteCategoryFilter;
  urgencyFilter: AlerteUrgencyStatFilter | null;
  searchQuery: string;
  sortMode: AlerteSortMode;
  viewMode: AlerteViewMode;
};

const DEFAULTS: SuiviAlertesPreferences = {
  categoryFilter: "all",
  urgencyFilter: null,
  searchQuery: "",
  sortMode: "days_desc",
  viewMode: "detailed",
};

const VALID_CATEGORY = new Set<string>([
  "all",
  "client",
  "prospect",
  "filleul",
  "patrimoine",
]);
const VALID_URGENCY = new Set<string>(["plus30", "plus7", "recent"]);
const VALID_SORT = new Set<string>(["days_desc", "days_asc", "name", "type"]);
const VALID_VIEW = new Set<string>(["detailed", "compact"]);

function sanitize(raw: Partial<SuiviAlertesPreferences>): SuiviAlertesPreferences {
  return {
    categoryFilter: VALID_CATEGORY.has(raw.categoryFilter ?? "")
      ? (raw.categoryFilter as AlerteCategoryFilter)
      : DEFAULTS.categoryFilter,
    urgencyFilter:
      raw.urgencyFilter != null && VALID_URGENCY.has(raw.urgencyFilter)
        ? (raw.urgencyFilter as AlerteUrgencyStatFilter)
        : null,
    searchQuery:
      typeof raw.searchQuery === "string" ? raw.searchQuery : DEFAULTS.searchQuery,
    sortMode: VALID_SORT.has(raw.sortMode ?? "")
      ? (raw.sortMode as AlerteSortMode)
      : DEFAULTS.sortMode,
    viewMode: VALID_VIEW.has(raw.viewMode ?? "")
      ? (raw.viewMode as AlerteViewMode)
      : DEFAULTS.viewMode,
  };
}

export function loadSuiviAlertesPreferences(): SuiviAlertesPreferences {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    return sanitize(JSON.parse(raw) as Partial<SuiviAlertesPreferences>);
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSuiviAlertesPreferences(prefs: SuiviAlertesPreferences): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}
