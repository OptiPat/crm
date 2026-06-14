import type { Foyer } from "@/lib/api/tauri-foyers";

/** Texte type section 2.1 lettre de mission — brouillon à ajuster par dossier. */
export const DEFAULT_OBJECTIFS_CLIENT_TEXT =
  "Vos objectifs d'investissement sont de compléter vos revenus régulièrement et de préparer votre retraite.";

/** Objectifs client — brouillon depuis le foyer CRM ou texte type. */
export function buildDefaultObjectifsClient(foyer: Foyer | null): string {
  const fromFoyer = foyer?.objectifs_patrimoniaux?.trim();
  if (fromFoyer) return fromFoyer;
  return DEFAULT_OBJECTIFS_CLIENT_TEXT;
}
