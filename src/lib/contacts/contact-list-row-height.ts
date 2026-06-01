import type { Contact } from "@/lib/api/tauri-contacts";
import type { ContactEtiquetteDetails } from "@/lib/api/tauri-etiquettes";

/** Espace vertical entre cartes (= `space-y-2` de la liste non virtualisée). */
export const CONTACT_LIST_ROW_GAP_PX = 8;

/** Hauteur initiale avant mesure DOM (virtualisation). */
export const CONTACT_ROW_FALLBACK_PX = 112;

/**
 * Estimation grossière avant mesure ResizeObserver (scroll initial).
 * La hauteur réelle est mesurée au rendu — pas besoin de sur-estimer.
 */
export function estimateContactListRowHeight(
  contact: Contact,
  etiquettesParContact: Record<number, ContactEtiquetteDetails[]>
): number {
  const etiquetteCount = contact.id
    ? etiquettesParContact[contact.id]?.length ?? 0
    : 0;

  let height = 100;

  if (etiquetteCount > 0) {
    height += 28 + Math.max(0, Math.ceil(Math.min(etiquetteCount, 4) / 2) - 1) * 20;
  }

  if (contact.email || contact.telephone) {
    height += 28;
  }

  return height;
}
