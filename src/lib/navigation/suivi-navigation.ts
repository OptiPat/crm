import type { EtiquetteEmailQueueStatus } from "@/lib/api/tauri-etiquettes";

export type SuiviMainTab = "alertes" | "etiquettes" | "envois";

const TAB_KEY = "crm_nav_suivi_tab";
const ENVOIS_SUBTAB_KEY = "crm_nav_suivi_envois_subtab";

export function setSuiviNavigationIntent(
  tab: SuiviMainTab,
  envoisSubTab?: EtiquetteEmailQueueStatus
): void {
  sessionStorage.setItem(TAB_KEY, tab);
  if (envoisSubTab) {
    sessionStorage.setItem(ENVOIS_SUBTAB_KEY, envoisSubTab);
  } else {
    sessionStorage.removeItem(ENVOIS_SUBTAB_KEY);
  }
}

export function consumeSuiviNavigationIntent(): {
  tab: SuiviMainTab | null;
  envoisSubTab: EtiquetteEmailQueueStatus | null;
} {
  const rawTab = sessionStorage.getItem(TAB_KEY);
  sessionStorage.removeItem(TAB_KEY);

  const rawSub = sessionStorage.getItem(ENVOIS_SUBTAB_KEY);
  sessionStorage.removeItem(ENVOIS_SUBTAB_KEY);

  const tab =
    rawTab === "alertes" || rawTab === "etiquettes" || rawTab === "envois" ? rawTab : null;

  const envoisSubTab =
    rawSub === "ready" ||
    rawSub === "incomplete" ||
    rawSub === "sent" ||
    rawSub === "followup"
      ? rawSub
      : null;

  return { tab, envoisSubTab };
}

export function navigateToSuivi(
  onPageChange: (page: string) => void,
  tab: SuiviMainTab,
  envoisSubTab?: EtiquetteEmailQueueStatus
): void {
  setSuiviNavigationIntent(tab, envoisSubTab);
  onPageChange("suivi");
}
