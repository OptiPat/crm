import type {
  DocumentsPortfolioGroup,
  DocumentsPortfolioSort,
} from "@/lib/documents/documents-portfolio-utils";

const STORAGE_KEY = "crm_documents_page_v1";

export type DocumentsPagePreferences = {
  sortKey: DocumentsPortfolioSort;
  groupMode: DocumentsPortfolioGroup;
  typeFilter: string;
  contactFilterId: number | null;
};

const DEFAULTS: DocumentsPagePreferences = {
  sortKey: "date_desc",
  groupMode: "flat",
  typeFilter: "ALL",
  contactFilterId: null,
};

const VALID_SORTS = new Set<string>([
  "date_desc",
  "name_asc",
  "client_asc",
  "type_asc",
  "size_desc",
]);

const VALID_GROUPS = new Set<string>(["flat", "client", "type"]);

const VALID_TYPES = new Set<string>([
  "ALL",
  "IDENTITE",
  "FISCAL",
  "PATRIMOINE",
  "QPI",
  "CONTRAT",
  "RELEVE",
  "AUTRE",
]);

function sanitizePreferences(
  raw: Partial<DocumentsPagePreferences>
): DocumentsPagePreferences {
  return {
    sortKey: VALID_SORTS.has(raw.sortKey ?? "")
      ? (raw.sortKey as DocumentsPortfolioSort)
      : DEFAULTS.sortKey,
    groupMode: VALID_GROUPS.has(raw.groupMode ?? "")
      ? (raw.groupMode as DocumentsPortfolioGroup)
      : DEFAULTS.groupMode,
    typeFilter: VALID_TYPES.has(raw.typeFilter ?? "")
      ? (raw.typeFilter as string)
      : DEFAULTS.typeFilter,
    contactFilterId:
      typeof raw.contactFilterId === "number" && raw.contactFilterId > 0
        ? raw.contactFilterId
        : null,
  };
}

export function loadDocumentsPagePreferences(): DocumentsPagePreferences {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    return sanitizePreferences(JSON.parse(raw) as Partial<DocumentsPagePreferences>);
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveDocumentsPagePreferences(prefs: DocumentsPagePreferences): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}
