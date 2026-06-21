import type { EtiquetteEmailQueueStatus } from "@/lib/api/tauri-etiquettes";
import type { SuiviMainTab } from "@/lib/navigation/suivi-navigation";
import {
  CRM_OPEN_CONTACT_ID_KEY,
  CRM_OPEN_CONTACT_TAB_KEY,
  type ContactDetailTabHint,
} from "@/lib/investissements/investissement-navigation";
import type { SettingsSectionId } from "@/lib/settings/parametres-completion";

export const CRM_NAV_EVENT = "crm-app-navigation";
export const CRM_PARAMETRES_SECTION_KEY = "crm_nav_parametres_section";
export const CRM_PARAMETRES_SCROLL_KEY = "crm_nav_parametres_scroll";

export type AppNavigationDetail =
  | { type: "open-contact"; contactId: number; tab?: ContactDetailTabHint }
  | {
      type: "suivi";
      tab: SuiviMainTab;
      envoisSubTab?: EtiquetteEmailQueueStatus;
      contactId?: number;
      etiquetteId?: number;
    }
  | { type: "interactions"; contactId?: number }
  | { type: "documents"; contactId?: number }
  | { type: "prescripteurs"; rootId?: number; focusContactId?: number }
  | { type: "parametres"; section: SettingsSectionId; scrollToId?: string }
  | { type: "page"; page: string };

function persistNavigationDetail(detail: AppNavigationDetail): void {
  switch (detail.type) {
    case "open-contact":
      sessionStorage.setItem(CRM_OPEN_CONTACT_ID_KEY, String(detail.contactId));
      if (detail.tab) {
        sessionStorage.setItem(CRM_OPEN_CONTACT_TAB_KEY, detail.tab);
      }
      break;
    case "suivi":
      sessionStorage.setItem("crm_nav_suivi_tab", detail.tab);
      if (detail.envoisSubTab) {
        sessionStorage.setItem("crm_nav_suivi_envois_subtab", detail.envoisSubTab);
      } else {
        sessionStorage.removeItem("crm_nav_suivi_envois_subtab");
      }
      if (detail.contactId != null) {
        sessionStorage.setItem("crm_nav_suivi_contact_id", String(detail.contactId));
        if (detail.tab === "envois") {
          sessionStorage.setItem("crm_nav_suivi_envois_contact_id", String(detail.contactId));
        }
      } else {
        sessionStorage.removeItem("crm_nav_suivi_contact_id");
      }
      if (detail.etiquetteId != null) {
        sessionStorage.setItem("crm_nav_suivi_etiquette_id", String(detail.etiquetteId));
      } else {
        sessionStorage.removeItem("crm_nav_suivi_etiquette_id");
      }
      break;
    case "interactions":
      if (detail.contactId != null) {
        sessionStorage.setItem("crm_nav_interactions_contact_id", String(detail.contactId));
      }
      break;
    case "documents":
      if (detail.contactId != null) {
        sessionStorage.setItem("crm_nav_documents_contact_id", String(detail.contactId));
      }
      break;
    case "parametres":
      sessionStorage.setItem(CRM_PARAMETRES_SECTION_KEY, detail.section);
      if (detail.scrollToId) {
        sessionStorage.setItem(CRM_PARAMETRES_SCROLL_KEY, detail.scrollToId);
      } else {
        sessionStorage.removeItem(CRM_PARAMETRES_SCROLL_KEY);
      }
      break;
    default:
      break;
  }
}

/** Notifie les pages déjà montées + persiste pour le prochain mount. */
export function dispatchAppNavigation(detail: AppNavigationDetail): void {
  persistNavigationDetail(detail);
  window.dispatchEvent(new CustomEvent<AppNavigationDetail>(CRM_NAV_EVENT, { detail }));
}

export function subscribeAppNavigation(
  handler: (detail: AppNavigationDetail) => void
): () => void {
  const listener = (e: Event) => {
    const ev = e as CustomEvent<AppNavigationDetail>;
    if (ev.detail) handler(ev.detail);
  };
  window.addEventListener(CRM_NAV_EVENT, listener);
  return () => window.removeEventListener(CRM_NAV_EVENT, listener);
}

export function navigateAppPage(
  currentPage: string,
  setCurrentPage: (page: string) => void,
  targetPage: string,
  detail?: AppNavigationDetail
): void {
  if (detail) {
    dispatchAppNavigation(detail);
  }
  if (currentPage !== targetPage) {
    setCurrentPage(targetPage);
  }
}

export function requestOpenContact(
  contactId: number,
  options?: {
    tab?: ContactDetailTabHint;
    currentPage?: string;
    setCurrentPage?: (page: string) => void;
  }
): void {
  const detail: AppNavigationDetail = {
    type: "open-contact",
    contactId,
    tab: options?.tab,
  };
  if (options?.setCurrentPage) {
    navigateAppPage(options.currentPage ?? "", options.setCurrentPage, "contacts", detail);
  } else {
    dispatchAppNavigation(detail);
  }
}

/** Ouvre Paramètres sur une section (ex. profil → Documents CIF). */
export function requestOpenParametres(
  section: SettingsSectionId,
  options?: {
    scrollToId?: string;
    currentPage?: string;
    setCurrentPage?: (page: string) => void;
  }
): void {
  const detail: AppNavigationDetail = {
    type: "parametres",
    section,
    scrollToId: options?.scrollToId,
  };
  if (options?.setCurrentPage) {
    navigateAppPage(options.currentPage ?? "", options.setCurrentPage, "parametres", detail);
  } else {
    dispatchAppNavigation(detail);
  }
}
