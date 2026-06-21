import { dispatchAppNavigation } from "@/lib/navigation/app-navigation";

const PARTENAIRE_ID_KEY = "crm_nav_partenaires_partenaire_id";
const FOCUS_INV_KEY = "crm_nav_partenaires_focus_investissement_id";

export type PartenairesNavigationIntent = {
  partenaireId?: number;
  focusInvestissementId?: number;
};

export function setPartenairesNavigationIntent(
  intent: PartenairesNavigationIntent
): void {
  if (intent.partenaireId != null) {
    sessionStorage.setItem(PARTENAIRE_ID_KEY, String(intent.partenaireId));
  } else {
    sessionStorage.removeItem(PARTENAIRE_ID_KEY);
  }
  if (intent.focusInvestissementId != null) {
    sessionStorage.setItem(FOCUS_INV_KEY, String(intent.focusInvestissementId));
  } else {
    sessionStorage.removeItem(FOCUS_INV_KEY);
  }
}

export function consumePartenairesNavigationIntent(): PartenairesNavigationIntent {
  const partenaireRaw = sessionStorage.getItem(PARTENAIRE_ID_KEY);
  const focusRaw = sessionStorage.getItem(FOCUS_INV_KEY);
  sessionStorage.removeItem(PARTENAIRE_ID_KEY);
  sessionStorage.removeItem(FOCUS_INV_KEY);
  const partenaireId = partenaireRaw ? parseInt(partenaireRaw, 10) : undefined;
  const focusInvestissementId = focusRaw ? parseInt(focusRaw, 10) : undefined;
  return {
    partenaireId:
      partenaireId != null && Number.isFinite(partenaireId) ? partenaireId : undefined,
    focusInvestissementId:
      focusInvestissementId != null && Number.isFinite(focusInvestissementId)
        ? focusInvestissementId
        : undefined,
  };
}

export function navigateToPartenaires(
  onPageChange: (page: string) => void,
  options?: PartenairesNavigationIntent & { currentPage?: string }
): void {
  if (options?.partenaireId != null || options?.focusInvestissementId != null) {
    setPartenairesNavigationIntent({
      partenaireId: options.partenaireId,
      focusInvestissementId: options.focusInvestissementId,
    });
  }
  dispatchAppNavigation({
    type: "partenaires",
    partenaireId: options?.partenaireId,
    focusInvestissementId: options?.focusInvestissementId,
  });
  if (options?.currentPage !== "partenaires") {
    onPageChange("partenaires");
  }
}
