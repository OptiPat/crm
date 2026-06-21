import type {
  PrescripteurSortId,
  PrescripteurStatFilter,
} from "@/lib/prescripteurs/prescripteur-search";

const STORAGE_KEY = "crm_prescripteurs_page_v1";

export type PrescripteursPagePreferences = {
  searchQuery: string;
  sortId: PrescripteurSortId;
  statFilter: PrescripteurStatFilter | null;
  selectedPrescripteurId: number | null;
};

const DEFAULTS: PrescripteursPagePreferences = {
  searchQuery: "",
  sortId: "patrimoine_desc",
  statFilter: null,
  selectedPrescripteurId: null,
};

const VALID_SORT = new Set<string>(["patrimoine_desc", "clients_desc", "name_asc"]);
const VALID_STAT = new Set<string>(["with_clients", "zero_clients"]);

function sanitizePreferences(
  raw: Partial<PrescripteursPagePreferences>
): PrescripteursPagePreferences {
  return {
    searchQuery:
      typeof raw.searchQuery === "string" ? raw.searchQuery : DEFAULTS.searchQuery,
    sortId: VALID_SORT.has(raw.sortId ?? "")
      ? (raw.sortId as PrescripteurSortId)
      : DEFAULTS.sortId,
    statFilter:
      raw.statFilter != null && VALID_STAT.has(raw.statFilter)
        ? (raw.statFilter as PrescripteurStatFilter)
        : null,
    selectedPrescripteurId:
      typeof raw.selectedPrescripteurId === "number" &&
      Number.isFinite(raw.selectedPrescripteurId)
        ? raw.selectedPrescripteurId
        : null,
  };
}

export function loadPrescripteursPagePreferences(): PrescripteursPagePreferences {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    return sanitizePreferences(JSON.parse(raw) as Partial<PrescripteursPagePreferences>);
  } catch {
    return { ...DEFAULTS };
  }
}

export function savePrescripteursPagePreferences(
  prefs: PrescripteursPagePreferences
): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}
