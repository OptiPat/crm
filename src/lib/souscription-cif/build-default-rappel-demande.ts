import type { Contact } from "@/lib/api/tauri-contacts";
import type { Foyer } from "@/lib/api/tauri-foyers";
import {
  formatObjectifsRappelDemande,
  resolveObjectifsPatrimoniaux,
} from "@/lib/souscription-cif/objectifs-patrimoniaux-map";

/** Texte type — rapport de mission, rappel de la demande (page 1). */
export const DEFAULT_RAPPEL_DEMANDE_TEXT =
  "Le client souhaite compléter ses revenus régulièrement et préparer sa retraite.";

export function buildDefaultRappelDemande(
  contact: Contact | null,
  foyer: Foyer | null
): string {
  const objectifs = resolveObjectifsPatrimoniaux(contact, foyer);
  if (objectifs) return formatObjectifsRappelDemande(objectifs);
  return DEFAULT_RAPPEL_DEMANDE_TEXT;
}
