import type { Contact } from "@/lib/api/tauri-contacts";
import type { Foyer } from "@/lib/api/tauri-foyers";

export function resolveObjectifsPatrimoniaux(
  contact: Pick<Contact, "objectifs_patrimoniaux"> | null,
  foyer: Pick<Foyer, "objectifs_patrimoniaux"> | null
): string | null {
  const fromContact = contact?.objectifs_patrimoniaux?.trim();
  if (fromContact) return fromContact;
  return foyer?.objectifs_patrimoniaux?.trim() || null;
}

function lowercaseFirstChar(text: string): string {
  if (!text) return text;
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/** Lettre de mission § objectifs — « Vos objectifs d'investissement sont … » */
export function formatObjectifsLettreMission(objectifs: string): string {
  const body = objectifs.trim();
  if (body.startsWith("Vos objectifs d'investissement")) return body;
  const continuation = body.startsWith("de ") ? body : `de ${lowercaseFirstChar(body)}`;
  return `Vos objectifs d'investissement sont ${continuation}`;
}

/** Rapport de mission — rappel de la demande — « Le client souhaite … » */
export function formatObjectifsRappelDemande(objectifs: string): string {
  const body = objectifs.trim();
  if (body.startsWith("Le client souhaite")) return body;
  return `Le client souhaite ${lowercaseFirstChar(body)}`;
}
