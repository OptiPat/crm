const ECHEANCE_KEY = "crm_nav_taches_echeance_filter";

export type TachesNavigationEcheanceFilter = "urgent";

export function setTachesNavigationIntent(
  echeanceFilter: TachesNavigationEcheanceFilter
): void {
  sessionStorage.setItem(ECHEANCE_KEY, echeanceFilter);
}

export function consumeTachesNavigationIntent(): TachesNavigationEcheanceFilter | null {
  const raw = sessionStorage.getItem(ECHEANCE_KEY);
  sessionStorage.removeItem(ECHEANCE_KEY);
  return raw === "urgent" ? "urgent" : null;
}

export function navigateToTaches(
  onPageChange: (page: string) => void,
  echeanceFilter: TachesNavigationEcheanceFilter = "urgent",
  currentPage?: string
): void {
  setTachesNavigationIntent(echeanceFilter);
  if (currentPage !== "taches") {
    onPageChange("taches");
  }
}
