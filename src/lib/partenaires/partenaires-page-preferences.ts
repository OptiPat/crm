import type {
  PartenaireSortId,
  PartenaireStatFilter,
} from "@/lib/partenaires/partenaires-search";

const STORAGE_KEY = "crm_partenaires_page_v1";

export type PartenairesPagePreferences = {
  searchQuery: string;
  sortId: PartenaireSortId;
  statFilter: PartenaireStatFilter | null;
  typeFilter: string;
  expandedPartenaireId: number | null;
};

const DEFAULTS: PartenairesPagePreferences = {
  searchQuery: "",
  sortId: "encours_desc",
  statFilter: null,
  typeFilter: "ALL",
  expandedPartenaireId: null,
};

const VALID_SORT = new Set<string>(["encours_desc", "produits_desc", "name_asc"]);
const VALID_STAT = new Set<string>(["promoteur", "with_encours", "assureur", "scpi"]);

function sanitizePreferences(
  raw: Partial<PartenairesPagePreferences>
): PartenairesPagePreferences {
  return {
    searchQuery:
      typeof raw.searchQuery === "string" ? raw.searchQuery : DEFAULTS.searchQuery,
    sortId: VALID_SORT.has(raw.sortId ?? "")
      ? (raw.sortId as PartenaireSortId)
      : DEFAULTS.sortId,
    statFilter:
      raw.statFilter != null && VALID_STAT.has(raw.statFilter)
        ? (raw.statFilter as PartenaireStatFilter)
        : null,
    typeFilter: typeof raw.typeFilter === "string" ? raw.typeFilter : DEFAULTS.typeFilter,
    expandedPartenaireId:
      typeof raw.expandedPartenaireId === "number" &&
      Number.isFinite(raw.expandedPartenaireId)
        ? raw.expandedPartenaireId
        : null,
  };
}

export function loadPartenairesPagePreferences(): PartenairesPagePreferences {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    return sanitizePreferences(JSON.parse(raw) as Partial<PartenairesPagePreferences>);
  } catch {
    return { ...DEFAULTS };
  }
}

export function savePartenairesPagePreferences(
  prefs: PartenairesPagePreferences
): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}
