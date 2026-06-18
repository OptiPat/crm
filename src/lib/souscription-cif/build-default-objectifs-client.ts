import type { Contact } from "@/lib/api/tauri-contacts";
import type { Foyer } from "@/lib/api/tauri-foyers";
import {
  formatObjectifsLettreMission,
  resolveObjectifsPatrimoniaux,
} from "@/lib/souscription-cif/objectifs-patrimoniaux-map";

/** Texte type section 2.1 lettre de mission — brouillon à ajuster par dossier. */
export const DEFAULT_OBJECTIFS_CLIENT_TEXT =
  "Vos objectifs d'investissement sont de compléter vos revenus régulièrement et de préparer votre retraite.";

/** Objectifs client — brouillon depuis contact / foyer CRM ou texte type. */
export function buildDefaultObjectifsClient(
  contact: Contact | null,
  foyer: Foyer | null
): string {
  const objectifs = resolveObjectifsPatrimoniaux(contact, foyer);
  if (objectifs) return formatObjectifsLettreMission(objectifs);
  return DEFAULT_OBJECTIFS_CLIENT_TEXT;
}
