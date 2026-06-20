import type { Contact } from "@/lib/api/tauri-contacts";

export type InvestissementOwnerTarget = {
  contact_id?: number | null;
  foyer_id?: number | null;
  foyer_nom?: string | null;
};

/**
 * Résout le contact à ouvrir pour un placement (fiche → onglet Patrimoine).
 * Placements foyer sans contact_id → premier membre du foyer.
 */
export async function resolveInvestissementOwnerContactId(
  inv: InvestissementOwnerTarget,
  getContactsByFoyer: (foyerId: number) => Promise<Contact[]>
): Promise<{ contactId: number; viaFoyerLabel?: string } | null> {
  if (inv.contact_id != null && inv.contact_id > 0) {
    return { contactId: inv.contact_id };
  }
  if (inv.foyer_id != null && inv.foyer_id > 0) {
    const members = await getContactsByFoyer(inv.foyer_id);
    const first = members.find((m) => m.id != null && m.id > 0);
    if (first?.id) {
      return {
        contactId: first.id,
        viaFoyerLabel: inv.foyer_nom?.trim() || "foyer commun",
      };
    }
  }
  return null;
}
