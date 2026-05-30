import type { EtiquetteEmailQueueStatus } from "@/lib/api/tauri-etiquettes";

export type SuiviMainTab = "alertes" | "etiquettes" | "envois";

const TAB_KEY = "crm_nav_suivi_tab";
const ENVOIS_SUBTAB_KEY = "crm_nav_suivi_envois_subtab";
const CONTACT_KEY = "crm_nav_suivi_contact_id";
/** Conservé pour l’onglet Envois après consommation globale sur Suivi */
export const ENVOIS_CONTACT_KEY = "crm_nav_suivi_envois_contact_id";

export function setEnvoisContactFocus(contactId: number): void {
  sessionStorage.setItem(ENVOIS_CONTACT_KEY, String(contactId));
}

export function consumeEnvoisContactFocus(): number | null {
  const raw = sessionStorage.getItem(ENVOIS_CONTACT_KEY);
  sessionStorage.removeItem(ENVOIS_CONTACT_KEY);
  if (!raw) return null;
  const id = parseInt(raw, 10);
  return Number.isFinite(id) ? id : null;
}

export type SuiviNavigationIntent = {
  tab: SuiviMainTab | null;
  envoisSubTab: EtiquetteEmailQueueStatus | null;
  contactId: number | null;
};

export function setSuiviNavigationIntent(
  tab: SuiviMainTab,
  envoisSubTab?: EtiquetteEmailQueueStatus,
  contactId?: number
): void {
  sessionStorage.setItem(TAB_KEY, tab);
  if (envoisSubTab) {
    sessionStorage.setItem(ENVOIS_SUBTAB_KEY, envoisSubTab);
  } else {
    sessionStorage.removeItem(ENVOIS_SUBTAB_KEY);
  }
  if (contactId != null) {
    sessionStorage.setItem(CONTACT_KEY, String(contactId));
  } else {
    sessionStorage.removeItem(CONTACT_KEY);
  }
}

export function consumeSuiviNavigationIntent(): SuiviNavigationIntent {
  const rawTab = sessionStorage.getItem(TAB_KEY);
  sessionStorage.removeItem(TAB_KEY);

  const rawSub = sessionStorage.getItem(ENVOIS_SUBTAB_KEY);
  sessionStorage.removeItem(ENVOIS_SUBTAB_KEY);

  const rawContact = sessionStorage.getItem(CONTACT_KEY);
  sessionStorage.removeItem(CONTACT_KEY);

  const tab =
    rawTab === "alertes" || rawTab === "etiquettes" || rawTab === "envois" ? rawTab : null;

  const envoisSubTab =
    rawSub === "ready" ||
    rawSub === "incomplete" ||
    rawSub === "sent" ||
    rawSub === "followup"
      ? rawSub
      : null;

  const contactId =
    rawContact != null && rawContact !== "" ? parseInt(rawContact, 10) : null;

  return {
    tab,
    envoisSubTab,
    contactId: Number.isFinite(contactId) ? contactId : null,
  };
}

export function navigateToSuivi(
  onPageChange: (page: string) => void,
  tab: SuiviMainTab,
  envoisSubTab?: EtiquetteEmailQueueStatus,
  contactId?: number
): void {
  setSuiviNavigationIntent(tab, envoisSubTab, contactId);
  onPageChange("suivi");
}
