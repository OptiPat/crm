export const CRM_OPEN_FOYER_ID_KEY = "crm_open_foyer_id";

export function stashOpenFoyerId(foyerId: number): void {
  sessionStorage.setItem(CRM_OPEN_FOYER_ID_KEY, String(foyerId));
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

/** Lit et efface l'id — préférer peek + clear après validation côté page Foyers. */
export function consumeOpenFoyerId(): number | null {
  const id = peekOpenFoyerId();
  if (id != null) clearOpenFoyerId();
  return id;
}
