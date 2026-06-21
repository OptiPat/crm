import type { ContactsUiState } from "@/lib/contacts/contacts-session";
import type { ContactsPipelineStage } from "@/lib/contacts/contacts-pipeline-match";
import { dispatchAppNavigation } from "@/lib/navigation/app-navigation";

const FILTER_KEY = "crm_nav_contacts_category_filter";

export type ContactsCategoryFilter =
  | Pick<ContactsUiState, "mainTab" | "clientSubTab">
  | Pick<ContactsUiState, "mainTab" | "filleulSubTab">;

export type ContactsNavigationFilter =
  | ({ kind: "category" } & ContactsCategoryFilter)
  | { kind: "pipeline"; stage: ContactsPipelineStage };

const VALID_CLIENT_SUB = new Set(["CLIENT", "PROSPECT_CLIENT", "SUSPECT_CLIENT"]);
const VALID_FILLEUL_SUB = new Set([
  "FILLEUL",
  "PROSPECT_FILLEUL",
  "SUSPECT_FILLEUL",
  "FILLEUL_DESINSCRIT",
]);
const VALID_PIPELINE = new Set<ContactsPipelineStage>(["suspects", "prospects", "clients"]);

function parseContactsNavigationFilter(raw: unknown): ContactsNavigationFilter | null {
  if (!raw || typeof raw !== "object") return null;
  const parsed = raw as Record<string, unknown>;

  if (parsed.kind === "pipeline" && VALID_PIPELINE.has(parsed.stage as ContactsPipelineStage)) {
    return { kind: "pipeline", stage: parsed.stage as ContactsPipelineStage };
  }

  const legacyStage = parsed.pipelineStage ?? parsed.stage;
  if (VALID_PIPELINE.has(legacyStage as ContactsPipelineStage)) {
    return { kind: "pipeline", stage: legacyStage as ContactsPipelineStage };
  }

  if (parsed.kind === "category" || parsed.mainTab != null) {
    const mainTab = parsed.mainTab;
    if (mainTab === "clients" && VALID_CLIENT_SUB.has(String(parsed.clientSubTab))) {
      return {
        kind: "category",
        mainTab: "clients",
        clientSubTab: parsed.clientSubTab as ContactsUiState["clientSubTab"],
      };
    }
    if (mainTab === "filleuls" && VALID_FILLEUL_SUB.has(String(parsed.filleulSubTab))) {
      return {
        kind: "category",
        mainTab: "filleuls",
        filleulSubTab: parsed.filleulSubTab as ContactsUiState["filleulSubTab"],
      };
    }
  }

  return null;
}

export function setContactsNavigationFilter(filter: ContactsNavigationFilter): void {
  try {
    sessionStorage.setItem(FILTER_KEY, JSON.stringify(filter));
  } catch {
    /* ignore */
  }
}

export function consumeContactsNavigationFilter(): ContactsNavigationFilter | null {
  try {
    const raw = sessionStorage.getItem(FILTER_KEY);
    sessionStorage.removeItem(FILTER_KEY);
    if (!raw) return null;
    return parseContactsNavigationFilter(JSON.parse(raw));
  } catch {
    sessionStorage.removeItem(FILTER_KEY);
    return null;
  }
}

function navigateToContacts(
  onPageChange: (page: string) => void,
  filter: ContactsNavigationFilter,
  currentPage?: string
): void {
  setContactsNavigationFilter(filter);
  dispatchAppNavigation({ type: "page", page: "contacts" });
  if (currentPage !== "contacts") {
    onPageChange("contacts");
  }
}

export function navigateToContactsCategory(
  onPageChange: (page: string) => void,
  filter: ContactsCategoryFilter,
  currentPage?: string
): void {
  navigateToContacts(onPageChange, { kind: "category", ...filter }, currentPage);
}

export function navigateToContactsPipeline(
  onPageChange: (page: string) => void,
  stage: ContactsPipelineStage,
  currentPage?: string
): void {
  navigateToContacts(onPageChange, { kind: "pipeline", stage }, currentPage);
}
