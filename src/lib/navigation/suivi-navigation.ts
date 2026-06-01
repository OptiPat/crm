import type { EtiquetteEmailQueueStatus } from "@/lib/api/tauri-etiquettes";
import { dispatchAppNavigation } from "@/lib/navigation/app-navigation";

export type SuiviMainTab = "alertes" | "etiquettes" | "segments" | "envois";

const TAB_KEY = "crm_nav_suivi_tab";
const ENVOIS_SUBTAB_KEY = "crm_nav_suivi_envois_subtab";
const CONTACT_KEY = "crm_nav_suivi_contact_id";
const ETIQUETTE_KEY = "crm_nav_suivi_etiquette_id";
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
  etiquetteId: number | null;
};

export function setSuiviNavigationIntent(
  tab: SuiviMainTab,
  envoisSubTab?: EtiquetteEmailQueueStatus,
  contactId?: number,
  etiquetteId?: number
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
  if (etiquetteId != null) {
    sessionStorage.setItem(ETIQUETTE_KEY, String(etiquetteId));
  } else {
    sessionStorage.removeItem(ETIQUETTE_KEY);
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
    rawTab === "alertes" ||
    rawTab === "etiquettes" ||
    rawTab === "segments" ||
    rawTab === "envois"
      ? rawTab
      : null;

  const envoisSubTab =
    rawSub === "ready" ||
    rawSub === "incomplete" ||
    rawSub === "sent" ||
    rawSub === "followup"
      ? rawSub
      : null;

  const contactId =
    rawContact != null && rawContact !== "" ? parseInt(rawContact, 10) : null;

  const rawEtiquette = sessionStorage.getItem(ETIQUETTE_KEY);
  sessionStorage.removeItem(ETIQUETTE_KEY);
  const etiquetteId =
    rawEtiquette != null && rawEtiquette !== ""
      ? parseInt(rawEtiquette, 10)
      : null;

  return {
    tab,
    envoisSubTab,
    contactId: Number.isFinite(contactId) ? contactId : null,
    etiquetteId: Number.isFinite(etiquetteId) ? etiquetteId : null,
  };
}

export function navigateToSuivi(
  onPageChange: (page: string) => void,
  tab: SuiviMainTab,
  envoisSubTab?: EtiquetteEmailQueueStatus,
  contactId?: number,
  currentPage?: string,
  etiquetteId?: number
): void {
  setSuiviNavigationIntent(tab, envoisSubTab, contactId, etiquetteId);
  dispatchAppNavigation({ type: "suivi", tab, envoisSubTab, contactId, etiquetteId });
  if (currentPage !== "suivi") {
    onPageChange("suivi");
  }
}
