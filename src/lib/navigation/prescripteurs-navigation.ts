import { dispatchAppNavigation } from "@/lib/navigation/app-navigation";

const ROOT_KEY = "crm_nav_prescripteurs_root_id";
const FOCUS_KEY = "crm_nav_prescripteurs_focus_contact_id";

export type PrescripteursNavigationIntent = {
  rootId?: number;
  focusContactId?: number;
};

export function setPrescripteursNavigationIntent(
  intent: PrescripteursNavigationIntent
): void {
  if (intent.rootId != null) {
    sessionStorage.setItem(ROOT_KEY, String(intent.rootId));
  } else {
    sessionStorage.removeItem(ROOT_KEY);
  }
  if (intent.focusContactId != null) {
    sessionStorage.setItem(FOCUS_KEY, String(intent.focusContactId));
  } else {
    sessionStorage.removeItem(FOCUS_KEY);
  }
}

export function consumePrescripteursNavigationIntent(): PrescripteursNavigationIntent {
  const rootRaw = sessionStorage.getItem(ROOT_KEY);
  const focusRaw = sessionStorage.getItem(FOCUS_KEY);
  sessionStorage.removeItem(ROOT_KEY);
  sessionStorage.removeItem(FOCUS_KEY);
  const rootId = rootRaw ? parseInt(rootRaw, 10) : undefined;
  const focusContactId = focusRaw ? parseInt(focusRaw, 10) : undefined;
  return {
    rootId: rootId != null && Number.isFinite(rootId) ? rootId : undefined,
    focusContactId:
      focusContactId != null && Number.isFinite(focusContactId)
        ? focusContactId
        : undefined,
  };
}

export function navigateToPrescripteurs(
  onPageChange: (page: string) => void,
  options?: PrescripteursNavigationIntent & { currentPage?: string }
): void {
  if (options?.rootId != null || options?.focusContactId != null) {
    setPrescripteursNavigationIntent({
      rootId: options.rootId,
      focusContactId: options.focusContactId,
    });
  }
  dispatchAppNavigation({
    type: "prescripteurs",
    rootId: options?.rootId,
    focusContactId: options?.focusContactId,
  });
  if (options?.currentPage !== "prescripteurs") {
    onPageChange("prescripteurs");
  }
}
