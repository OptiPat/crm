const ECHEANCE_KEY = "crm_nav_taches_echeance_filter";
const CONTACT_KEY = "crm_nav_taches_focus_contact_id";

export const TACHES_NAVIGATION_EVENT = "crm:taches-navigation";

export type TachesNavigationEcheanceFilter = "urgent";

export type TachesNavigationIntent = {
  echeanceFilter: TachesNavigationEcheanceFilter | null;
  focusContactId: number | null;
};

export function setTachesNavigationIntent(
  echeanceFilter: TachesNavigationEcheanceFilter,
  focusContactId?: number
): void {
  sessionStorage.setItem(ECHEANCE_KEY, echeanceFilter);
  if (focusContactId != null) {
    sessionStorage.setItem(CONTACT_KEY, String(focusContactId));
  } else {
    sessionStorage.removeItem(CONTACT_KEY);
  }
}

export function consumeTachesNavigationIntent(): TachesNavigationIntent {
  const raw = sessionStorage.getItem(ECHEANCE_KEY);
  sessionStorage.removeItem(ECHEANCE_KEY);
  const contactRaw = sessionStorage.getItem(CONTACT_KEY);
  sessionStorage.removeItem(CONTACT_KEY);
  const focusContactId =
    contactRaw != null && contactRaw !== "" ? Number.parseInt(contactRaw, 10) : null;
  return {
    echeanceFilter: raw === "urgent" ? "urgent" : null,
    focusContactId:
      focusContactId != null && Number.isFinite(focusContactId) ? focusContactId : null,
  };
}

export function navigateToTaches(
  onPageChange: (page: string) => void,
  echeanceFilter: TachesNavigationEcheanceFilter = "urgent",
  currentPage?: string,
  focusContactId?: number
): void {
  setTachesNavigationIntent(echeanceFilter, focusContactId);
  if (currentPage !== "taches") {
    onPageChange("taches");
  } else {
    window.dispatchEvent(new CustomEvent(TACHES_NAVIGATION_EVENT));
  }
}
