import { dispatchAppNavigation } from "@/lib/navigation/app-navigation";

const KEY_KEY = "crm_nav_familles_famille_key";
const FOCUS_KEY = "crm_nav_familles_focus_contact_id";

export type FamillesNavigationIntent = {
  familleKey?: string;
  focusContactId?: number;
};

export function setFamillesNavigationIntent(intent: FamillesNavigationIntent): void {
  if (intent.familleKey != null) {
    sessionStorage.setItem(KEY_KEY, intent.familleKey);
  } else {
    sessionStorage.removeItem(KEY_KEY);
  }
  if (intent.focusContactId != null) {
    sessionStorage.setItem(FOCUS_KEY, String(intent.focusContactId));
  } else {
    sessionStorage.removeItem(FOCUS_KEY);
  }
}

export function consumeFamillesNavigationIntent(): FamillesNavigationIntent {
  const keyRaw = sessionStorage.getItem(KEY_KEY);
  const focusRaw = sessionStorage.getItem(FOCUS_KEY);
  sessionStorage.removeItem(KEY_KEY);
  sessionStorage.removeItem(FOCUS_KEY);
  const focusContactId = focusRaw ? parseInt(focusRaw, 10) : undefined;
  return {
    familleKey: keyRaw ?? undefined,
    focusContactId:
      focusContactId != null && Number.isFinite(focusContactId)
        ? focusContactId
        : undefined,
  };
}

export function navigateToFamilles(
  onPageChange: (page: string) => void,
  options?: FamillesNavigationIntent & { currentPage?: string }
): void {
  if (options?.familleKey != null || options?.focusContactId != null) {
    setFamillesNavigationIntent({
      familleKey: options.familleKey,
      focusContactId: options.focusContactId,
    });
  }
  dispatchAppNavigation({
    type: "familles",
    familleKey: options?.familleKey,
    focusContactId: options?.focusContactId,
  });
  if (options?.currentPage !== "familles") {
    onPageChange("familles");
  }
}
