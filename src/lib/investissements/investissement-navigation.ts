/** Clés session pour ouvrir une fiche contact depuis une autre page. */
export const CRM_OPEN_CONTACT_ID_KEY = "crm_open_contact_id";
export const CRM_OPEN_CONTACT_TAB_KEY = "crm_open_contact_tab";

export type ContactDetailTabHint = "synthese" | "relation" | "patrimoine" | "foyer";

import { dispatchAppNavigation } from "@/lib/navigation/app-navigation";

export function prepareOpenContact(
  contactId: number,
  tab: ContactDetailTabHint = "synthese"
): void {
  sessionStorage.setItem(CRM_OPEN_CONTACT_TAB_KEY, tab);
  sessionStorage.setItem(CRM_OPEN_CONTACT_ID_KEY, String(contactId));
  dispatchAppNavigation({ type: "open-contact", contactId, tab });
}

export function prepareOpenContactPatrimoine(contactId: number): void {
  prepareOpenContact(contactId, "patrimoine");
}

export function consumePendingOpenContactId(): number | null {
  const raw = sessionStorage.getItem(CRM_OPEN_CONTACT_ID_KEY);
  if (!raw) return null;
  sessionStorage.removeItem(CRM_OPEN_CONTACT_ID_KEY);
  const id = parseInt(raw, 10);
  return Number.isNaN(id) ? null : id;
}
