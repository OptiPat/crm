export type ContactsUiState = {
  mainTab: "clients" | "filleuls";
  clientSubTab: "CLIENT" | "PROSPECT_CLIENT" | "SUSPECT_CLIENT";
  filleulSubTab:
    | "FILLEUL"
    | "PROSPECT_FILLEUL"
    | "SUSPECT_FILLEUL"
    | "FILLEUL_DESINSCRIT";
  statutFilter: string;
  etiquetteFilter: string;
  groupByFoyer: boolean;
};

const STORAGE_KEY = "crm_contacts_ui_v1";

export function loadContactsUiState(): Partial<ContactsUiState> | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Partial<ContactsUiState>;
  } catch {
    return null;
  }
}

export function saveContactsUiState(state: ContactsUiState): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}
