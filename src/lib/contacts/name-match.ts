/** Normalise un nom pour comparaison (casse, accents, espaces). */
export function normalizeContactName(value: string): string {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[''`]/g, "")
    .replace(/\s+/g, " ");
}

export function contactNameKey(nom: string, prenom: string): string {
  return `${normalizeContactName(nom)}|${normalizeContactName(prenom)}`;
}

export function findContactByNameKey<T extends { nom: string; prenom: string }>(
  contacts: T[],
  nom: string,
  prenom: string
): T | undefined {
  const key = contactNameKey(nom, prenom);
  return contacts.find((c) => contactNameKey(c.nom, c.prenom) === key);
}

/** Clé canonique : nom/prénom inversés = même personne (dédup, doublons Excel). */
export function contactNameKeyCanonical(nom: string, prenom: string): string {
  const a = normalizeContactName(nom);
  const b = normalizeContactName(prenom);
  return a <= b ? `${a}|${b}` : `${b}|${a}`;
}

/** Recherche directe puis nom/prénom inversés. */
export function findContactByNameKeyWithSwap<T extends { nom: string; prenom: string }>(
  contacts: T[],
  nom: string,
  prenom: string
): T | undefined {
  return (
    findContactByNameKey(contacts, nom, prenom) ??
    findContactByNameKey(contacts, prenom, nom)
  );
}

export function buildContactIdMap(
  contacts: { nom: string; prenom: string; id: number }[]
): Map<string, number> {
  const map = new Map<string, number>();
  for (const c of contacts) {
    map.set(contactNameKey(c.nom, c.prenom), c.id);
  }
  return map;
}

export type ParrainResolveStatus = "found" | "in_file" | "missing";

export interface ParrainResolveResult {
  status: ParrainResolveStatus;
  label: string;
  parrainId?: number;
  swapped?: boolean;
}

/** Résout un parrain dans le CRM, le fichier d'import, ou signale l'absence. */
export function resolveParrain(
  nomParrain: string,
  prenomParrain: string,
  existingContacts: { nom: string; prenom: string; id?: number }[],
  importNameKeys: Set<string>
): ParrainResolveResult {
  const nom = String(nomParrain).trim();
  const prenom = String(prenomParrain).trim();
  if (!nom || !prenom) {
    return { status: "missing", label: "" };
  }

  const direct = findContactByNameKey(existingContacts, nom, prenom);
  if (direct?.id) {
    return {
      status: "found",
      label: `${direct.prenom} ${direct.nom}`,
      parrainId: direct.id,
    };
  }

  if (importNameKeys.has(contactNameKey(nom, prenom))) {
    return { status: "in_file", label: `${prenom} ${nom}` };
  }

  const swappedContact = findContactByNameKey(existingContacts, prenom, nom);
  if (swappedContact?.id) {
    return {
      status: "found",
      label: `${swappedContact.prenom} ${swappedContact.nom}`,
      parrainId: swappedContact.id,
      swapped: true,
    };
  }

  if (importNameKeys.has(contactNameKey(prenom, nom))) {
    return {
      status: "in_file",
      label: `${nom} ${prenom}`,
      swapped: true,
    };
  }

  return { status: "missing", label: `${prenom} ${nom}` };
}

export function lookupParrainId(
  nomParrain: string,
  prenomParrain: string,
  contactsMap: Map<string, number>,
  allContacts: { nom: string; prenom: string; id: number }[]
): { id?: number; swapped?: boolean } {
  const nom = String(nomParrain).trim();
  const prenom = String(prenomParrain).trim();
  if (!nom || !prenom) return {};

  const directKey = contactNameKey(nom, prenom);
  if (contactsMap.has(directKey)) {
    return { id: contactsMap.get(directKey) };
  }

  const swappedKey = contactNameKey(prenom, nom);
  if (contactsMap.has(swappedKey)) {
    return { id: contactsMap.get(swappedKey), swapped: true };
  }

  const found = findContactByNameKey(allContacts, nom, prenom);
  if (found) return { id: found.id };

  const swapped = findContactByNameKey(allContacts, prenom, nom);
  if (swapped) return { id: swapped.id, swapped: true };

  return {};
}
