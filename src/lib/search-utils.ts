import { normalizeContactName } from "@/lib/contacts/name-match";

function normalizeSearchQuery(query: string): string {
  return normalizeContactName(query);
}

/** Recherche insensible à la casse et aux accents. */
export function textMatchesSearch(
  query: string,
  ...values: (string | null | undefined)[]
): boolean {
  const q = normalizeSearchQuery(query);
  if (!q) return true;

  const normalizedValues = values
    .filter((v): v is string => Boolean(v?.trim()))
    .map((v) => normalizeContactName(v));

  if (normalizedValues.length === 0) return false;

  if (normalizedValues.some((v) => v.includes(q))) return true;

  const tokens = q.split(" ").filter(Boolean);
  if (tokens.length <= 1) return false;

  return tokens.every((token) =>
    normalizedValues.some((v) => v.includes(token))
  );
}

export function contactMatchesSearch(
  query: string,
  contact: {
    nom?: string;
    prenom?: string;
    email?: string | null;
    telephone?: string | null;
  }
): boolean {
  const fullPrenomNom = [contact.prenom, contact.nom].filter(Boolean).join(" ");
  const fullNomPrenom = [contact.nom, contact.prenom].filter(Boolean).join(" ");
  return textMatchesSearch(
    query,
    contact.nom,
    contact.prenom,
    fullPrenomNom,
    fullNomPrenom,
    contact.email,
    contact.telephone
  );
}
