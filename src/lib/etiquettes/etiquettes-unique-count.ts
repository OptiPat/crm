import type { ContactEtiquetteDetails } from "@/lib/api/tauri-etiquettes";

/** Nombre de contacts distincts portant au moins une étiquette. */
export function countUniqueTaggedContacts(
  rows: ContactEtiquetteDetails[]
): number {
  return new Set(rows.map((r) => r.contact_id)).size;
}
