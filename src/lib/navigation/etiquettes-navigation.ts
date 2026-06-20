import { dispatchAppNavigation } from "@/lib/navigation/app-navigation";

const EDIT_KEY = "crm_nav_etiquettes_edit_id";

export function setEtiquetteEditFocus(etiquetteId: number): void {
  sessionStorage.setItem(EDIT_KEY, String(etiquetteId));
}

export function consumeEtiquetteEditFocus(): number | null {
  const raw = sessionStorage.getItem(EDIT_KEY);
  sessionStorage.removeItem(EDIT_KEY);
  if (!raw) return null;
  const id = parseInt(raw, 10);
  return Number.isFinite(id) ? id : null;
}

export function navigateToEtiquetteEdit(
  onPageChange: (page: string) => void,
  etiquetteId: number,
  currentPage?: string
): void {
  setEtiquetteEditFocus(etiquetteId);
  dispatchAppNavigation({ type: "page", page: "etiquettes" });
  if (currentPage !== "etiquettes") {
    onPageChange("etiquettes");
  }
}
