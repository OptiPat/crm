import type { ContactEtiquetteDetails, Etiquette } from "@/lib/api/tauri-etiquettes";

/** Étiquettes actives + inactives encore portées par au moins un contact (filtre Contacts). */
export function buildEtiquettesPourFiltre(
  all: Etiquette[],
  parContact: Record<number, ContactEtiquetteDetails[]>
): Etiquette[] {
  const usedIds = new Set<number>();
  for (const rows of Object.values(parContact)) {
    for (const r of rows) usedIds.add(r.etiquette_id);
  }

  return [...all]
    .filter((e) => e.actif !== false || usedIds.has(e.id))
    .sort((a, b) => {
      const aActif = a.actif !== false ? 0 : 1;
      const bActif = b.actif !== false ? 0 : 1;
      if (aActif !== bActif) return aActif - bActif;
      return a.nom.localeCompare(b.nom, "fr");
    });
}
