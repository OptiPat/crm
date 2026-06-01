import { ALERTE_ETIQUETTE_NOM } from "@/lib/alertes/alerte-etiquette-links";
import type { ContactEtiquetteDetails } from "@/lib/api/tauri-etiquettes";
import type { ContactPriorite } from "@/lib/contacts/contact-priority";

const SUIVI_ETIQUETTE_NOMS = new Set(Object.values(ALERTE_ETIQUETTE_NOM));

export function isSuiviSystemEtiquette(nom: string): boolean {
  return SUIVI_ETIQUETTE_NOMS.has(nom);
}

/** Évite « Suivi +1 an » à côté du nom + pastille « Suivi > 1 an » sur la même ligne. */
export function resolveSuiviRowDisplay(
  priorite: ContactPriorite,
  etiquettes: ContactEtiquetteDetails[] | undefined
): {
  showPrioriteLabel: boolean;
  etiquettesForRow: ContactEtiquetteDetails[];
} {
  const etiqs = etiquettes ?? [];
  const hasSuiviEtiquette = etiqs.some((e) =>
    isSuiviSystemEtiquette(e.etiquette_nom)
  );
  const urgent = priorite.priorite < 3 && !!priorite.label;

  if (urgent && hasSuiviEtiquette) {
    return { showPrioriteLabel: false, etiquettesForRow: etiqs };
  }

  return {
    showPrioriteLabel: urgent,
    etiquettesForRow: etiqs,
  };
}
