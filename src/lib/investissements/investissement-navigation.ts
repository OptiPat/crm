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

export const CRM_OPEN_CONTACT_INVESTISSEMENT_KEY = "crm_open_contact_investissement";

/** Ouvre la fiche contact (onglet Patrimoine) + formulaire investissement. */
export function prepareOpenContactWithInvestissement(contactId: number): void {
  prepareOpenContactPatrimoine(contactId);
  sessionStorage.setItem(CRM_OPEN_CONTACT_INVESTISSEMENT_KEY, "1");
}

/** Patrimoine + formulaire investissement sur la fiche déjà ouverte (pas de navigation inter-pages). */
export function armContactInvestissementFormOnDetail(): void {
  sessionStorage.setItem(CRM_OPEN_CONTACT_TAB_KEY, "patrimoine");
  sessionStorage.setItem(CRM_OPEN_CONTACT_INVESTISSEMENT_KEY, "1");
  sessionStorage.removeItem(CRM_OPEN_CONTACT_ID_KEY);
}

export function consumeOpenContactInvestissementFlag(): boolean {
  const raw = sessionStorage.getItem(CRM_OPEN_CONTACT_INVESTISSEMENT_KEY);
  sessionStorage.removeItem(CRM_OPEN_CONTACT_INVESTISSEMENT_KEY);
  return raw === "1";
}

export function consumePendingOpenContactId(): number | null {
  const raw = sessionStorage.getItem(CRM_OPEN_CONTACT_ID_KEY);
  if (!raw) return null;
  sessionStorage.removeItem(CRM_OPEN_CONTACT_ID_KEY);
  const id = parseInt(raw, 10);
  return Number.isNaN(id) ? null : id;
}
