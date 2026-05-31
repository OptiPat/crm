import type { ContactEtiquetteDetails } from "@/lib/api/tauri-etiquettes";

/** contact_id → attribue_par pour une étiquette donnée. */
export function buildEtiquetteAttributionMap(
  details: ContactEtiquetteDetails[],
  etiquetteId: number
): Record<number, string> {
  const map: Record<number, string> = {};
  for (const row of details) {
    if (row.etiquette_id === etiquetteId) {
      map[row.contact_id] = row.attribue_par;
    }
  }
  return map;
}
