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

/** Découpe la liste RIO « item1 ; item2 ; item3 » en items normalisés. */
export function parseRioObjectifsList(raw: string): string[] {
  return raw
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => lowercaseFirstChar(item));
}

/** Regroupe les objectifs en phrase : « a, b et c ». */
export function joinObjectifsPhrase(items: readonly string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0]!;
  if (items.length === 2) return `${items[0]} et ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} et ${items[items.length - 1]}`;
}

/** « de optimiser » → « d'optimiser » (lettre de mission). */
export function elideDeInfinitive(phrase: string): string {
  const trimmed = phrase.trim();
  if (!trimmed) return "de";
  if (/^[aeiouhéèêëàâùûüîïôœ]/i.test(trimmed)) {
    return `d'${trimmed}`;
  }
  return `de ${trimmed}`;
}

/** RIO « Se constituer… » → lettre « vous constituer… » (2ᵉ personne). */
export function objectifsToSecondPerson(phrase: string): string {
  return phrase.replace(/^se\b/i, "vous");
}

/** Formulation RIO (2ᵉ personne) → rappel rapport (3ᵉ personne). */
export function objectifsToThirdPerson(phrase: string): string {
  return phrase
    .replace(/\bvos\b/gi, "ses")
    .replace(/\bvotre\b/gi, "sa")
    .replace(/\bvous\b/gi, "se");
}

function formatObjectifsBody(raw: string, mode: "lettre" | "rappel"): string {
  const items = parseRioObjectifsList(raw);
  const phrase =
    mode === "rappel"
      ? joinObjectifsPhrase(items.map(objectifsToThirdPerson))
      : joinObjectifsPhrase(items.map(objectifsToSecondPerson));
  return phrase;
}

/** Lettre de mission § objectifs — « Vos objectifs d'investissement sont … » */
export function formatObjectifsLettreMission(objectifs: string): string {
  const body = objectifs.trim();
  if (body.startsWith("Vos objectifs d'investissement")) return body;

  const phrase = formatObjectifsBody(body, "lettre");
  if (!phrase) {
    const continuation = body.startsWith("de ") ? body : elideDeInfinitive(lowercaseFirstChar(body));
    return `Vos objectifs d'investissement sont ${continuation}`;
  }

  const continuation = body.startsWith("de ") ? phrase : elideDeInfinitive(phrase);
  return `Vos objectifs d'investissement sont ${continuation}`;
}

/** Rapport de mission — rappel de la demande — « Le client souhaite … » */
export function formatObjectifsRappelDemande(objectifs: string): string {
  const body = objectifs.trim();
  if (body.startsWith("Le client souhaite")) return body;

  const phrase = formatObjectifsBody(body, "rappel");
  if (!phrase) return `Le client souhaite ${lowercaseFirstChar(body)}`;
  return `Le client souhaite ${phrase}`;
}
