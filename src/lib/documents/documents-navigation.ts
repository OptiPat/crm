import { dispatchAppNavigation } from "@/lib/navigation/app-navigation";

const CONTACT_KEY = "crm_nav_documents_contact_id";

export function setDocumentsContactFocus(contactId: number): void {
  sessionStorage.setItem(CONTACT_KEY, String(contactId));
}

export function consumeDocumentsContactFocus(): number | null {
  const raw = sessionStorage.getItem(CONTACT_KEY);
  sessionStorage.removeItem(CONTACT_KEY);
  if (!raw) return null;
  const id = parseInt(raw, 10);
  return Number.isFinite(id) ? id : null;
}

export function navigateToDocuments(
  onPageChange: (page: string) => void,
  contactId?: number,
  currentPage?: string
): void {
  if (contactId != null) {
    setDocumentsContactFocus(contactId);
  }
  dispatchAppNavigation({ type: "documents", contactId });
  if (currentPage !== "documents") {
    onPageChange("documents");
  }
}
