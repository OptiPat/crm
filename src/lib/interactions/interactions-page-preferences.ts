import type { ExchangeKindFilter, ExchangeStatFilter } from "@/lib/interactions/exchange-history-filters";

const STORAGE_KEY = "crm_interactions_page_v1";

export type InteractionsPagePreferences = {
  searchQuery: string;
  typeFilter: string;
  kindFilter: ExchangeKindFilter;
  statFilter: ExchangeStatFilter | null;
};

const DEFAULTS: InteractionsPagePreferences = {
  searchQuery: "",
  typeFilter: "ALL",
  kindFilter: "all",
  statFilter: null,
};

const VALID_KIND = new Set<string>(["all", "email_campagne", "manual"]);
const VALID_STAT = new Set<string>([
  "no_reply",
  "this_week",
  "email_campagne",
  "manual",
]);

function sanitizePreferences(
  raw: Partial<InteractionsPagePreferences>
): InteractionsPagePreferences {
  return {
    searchQuery:
      typeof raw.searchQuery === "string" ? raw.searchQuery : DEFAULTS.searchQuery,
    typeFilter:
      typeof raw.typeFilter === "string" ? raw.typeFilter : DEFAULTS.typeFilter,
    kindFilter: VALID_KIND.has(raw.kindFilter ?? "")
      ? (raw.kindFilter as ExchangeKindFilter)
      : DEFAULTS.kindFilter,
    statFilter:
      raw.statFilter != null && VALID_STAT.has(raw.statFilter)
        ? (raw.statFilter as ExchangeStatFilter)
        : null,
  };
}

export function loadInteractionsPagePreferences(): InteractionsPagePreferences {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    return sanitizePreferences(JSON.parse(raw) as Partial<InteractionsPagePreferences>);
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveInteractionsPagePreferences(
  prefs: InteractionsPagePreferences
): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}
