import type { OrigineFilterChip } from "@/lib/investissements/patrimoine-tab-utils";
import type {
  InvestissementPortfolioGroup,
  InvestissementPortfolioSort,
} from "@/lib/investissements/investissements-portfolio-utils";

const STORAGE_KEY = "crm_investissements_page_v1";

export type InvestissementsPagePreferences = {
  sortKey: InvestissementPortfolioSort;
  groupMode: InvestissementPortfolioGroup;
  origineFilters: OrigineFilterChip[];
  typeFilters: string[];
  partenaireFilters: string[];
};

/** Valeurs par défaut de la page (seule source pour le tri et le regroupement par défaut). */
export const INVESTISSEMENTS_PAGE_DEFAULTS: Readonly<InvestissementsPagePreferences> = {
  sortKey: "client_asc",
  groupMode: "category",
  origineFilters: [],
  typeFilters: [],
  partenaireFilters: [],
};

const VALID_SORTS = new Set<string>([
  "date_desc",
  "montant_desc",
  "encours_desc",
  "client_asc",
  "demembrement_asc",
]);

const VALID_GROUPS = new Set<string>([
  "category",
  "client",
  "partenaire",
  "type",
  "flat",
]);

const VALID_ORIGINE = new Set<string>(["avec_moi", "a_cote"]);

function sanitizePreferences(
  raw: Partial<InvestissementsPagePreferences>
): InvestissementsPagePreferences {
  return {
    sortKey: VALID_SORTS.has(raw.sortKey ?? "")
      ? (raw.sortKey as InvestissementPortfolioSort)
      : INVESTISSEMENTS_PAGE_DEFAULTS.sortKey,
    groupMode: VALID_GROUPS.has(raw.groupMode ?? "")
      ? (raw.groupMode as InvestissementPortfolioGroup)
      : INVESTISSEMENTS_PAGE_DEFAULTS.groupMode,
    origineFilters: Array.isArray(raw.origineFilters)
      ? raw.origineFilters.filter((x): x is OrigineFilterChip =>
          VALID_ORIGINE.has(x)
        )
      : INVESTISSEMENTS_PAGE_DEFAULTS.origineFilters,
    typeFilters: Array.isArray(raw.typeFilters)
      ? raw.typeFilters.filter((x) => typeof x === "string")
      : INVESTISSEMENTS_PAGE_DEFAULTS.typeFilters,
    partenaireFilters: Array.isArray(raw.partenaireFilters)
      ? raw.partenaireFilters.filter((x) => typeof x === "string")
      : INVESTISSEMENTS_PAGE_DEFAULTS.partenaireFilters,
  };
}

export function loadInvestissementsPagePreferences(): InvestissementsPagePreferences {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...INVESTISSEMENTS_PAGE_DEFAULTS };
    return sanitizePreferences(JSON.parse(raw) as Partial<InvestissementsPagePreferences>);
  } catch {
    return { ...INVESTISSEMENTS_PAGE_DEFAULTS };
  }
}

export function saveInvestissementsPagePreferences(
  prefs: InvestissementsPagePreferences
): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}
