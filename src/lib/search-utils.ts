import { normalizeContactName } from "@/lib/contacts/name-match";

/** Recherche insensible à la casse et aux accents. */
export function textMatchesSearch(
  query: string,
  ...values: (string | null | undefined)[]
): boolean {
  const q = normalizeContactName(query);
  if (!q) return true;
  return values.some((v) => v && normalizeContactName(v).includes(q));
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
  return textMatchesSearch(
    query,
    contact.nom,
    contact.prenom,
    contact.email,
    contact.telephone
  );
}
