const CONTACT_KEY = "crm_nav_interactions_contact_id";

export function setInteractionsContactFocus(contactId: number): void {
  sessionStorage.setItem(CONTACT_KEY, String(contactId));
}

export function consumeInteractionsContactFocus(): number | null {
  const raw = sessionStorage.getItem(CONTACT_KEY);
  sessionStorage.removeItem(CONTACT_KEY);
  if (!raw) return null;
  const id = parseInt(raw, 10);
  return Number.isFinite(id) ? id : null;
}

export function navigateToInteractions(
  onPageChange: (page: string) => void,
  contactId?: number
): void {
  if (contactId != null) {
    setInteractionsContactFocus(contactId);
  }
  onPageChange("interactions");
}
