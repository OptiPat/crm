import { dispatchAppNavigation } from "@/lib/navigation/app-navigation";

/** Clé historique (Investissements, GlobalSearch legacy). */
export const CRM_OPEN_FOYER_ID_KEY = "crm_open_foyer_id";
const FOCUS_KEY = "crm_nav_foyers_focus_contact_id";

export type FoyersNavigationIntent = {
  foyerId?: number;
  focusContactId?: number;
};

export function setFoyersNavigationIntent(intent: FoyersNavigationIntent): void {
  if (intent.foyerId != null) {
    sessionStorage.setItem(CRM_OPEN_FOYER_ID_KEY, String(intent.foyerId));
  } else {
    sessionStorage.removeItem(CRM_OPEN_FOYER_ID_KEY);
  }
  if (intent.focusContactId != null) {
    sessionStorage.setItem(FOCUS_KEY, String(intent.focusContactId));
  } else {
    sessionStorage.removeItem(FOCUS_KEY);
  }
}

export function consumeFoyersNavigationIntent(): FoyersNavigationIntent {
  const foyerRaw = sessionStorage.getItem(CRM_OPEN_FOYER_ID_KEY);
  const focusRaw = sessionStorage.getItem(FOCUS_KEY);
  sessionStorage.removeItem(CRM_OPEN_FOYER_ID_KEY);
  sessionStorage.removeItem(FOCUS_KEY);
  const foyerId = foyerRaw ? parseInt(foyerRaw, 10) : undefined;
  const focusContactId = focusRaw ? parseInt(focusRaw, 10) : undefined;
  return {
    foyerId:
      foyerId != null && Number.isFinite(foyerId) ? foyerId : undefined,
    focusContactId:
      focusContactId != null && Number.isFinite(focusContactId)
        ? focusContactId
        : undefined,
  };
}

/** @deprecated Préférer navigateToFoyers — conservé pour compatibilité. */
export function stashOpenFoyerId(foyerId: number): void {
  setFoyersNavigationIntent({ foyerId });
}

export function peekOpenFoyerId(): number | null {
  const raw = sessionStorage.getItem(CRM_OPEN_FOYER_ID_KEY);
  if (!raw) return null;
  const id = parseInt(raw, 10);
  return Number.isNaN(id) ? null : id;
}

export function clearOpenFoyerId(): void {
  sessionStorage.removeItem(CRM_OPEN_FOYER_ID_KEY);
}

export function consumeOpenFoyerId(): number | null {
  const id = peekOpenFoyerId();
  if (id != null) clearOpenFoyerId();
  return id;
}

export function navigateToFoyers(
  onPageChange: (page: string) => void,
  options?: FoyersNavigationIntent & { currentPage?: string }
): void {
  if (options?.foyerId != null || options?.focusContactId != null) {
    setFoyersNavigationIntent({
      foyerId: options.foyerId,
      focusContactId: options.focusContactId,
    });
  }
  dispatchAppNavigation({
    type: "foyers",
    foyerId: options?.foyerId,
    focusContactId: options?.focusContactId,
  });
  if (options?.currentPage !== "foyers") {
    onPageChange("foyers");
  }
}
