/** Champs utilisés pour distinguer homonymes vs vrais doublons. */
export interface ContactIdentityFields {
  email?: string | null;
  telephone?: string | null;
}

export function normalizeEmail(email?: string | null): string {
  return String(email ?? "").trim().toLowerCase();
}

/** Chiffres uniquement (FR / international). */
export function normalizePhone(telephone?: string | null): string {
  const digits = String(telephone ?? "").replace(/\D/g, "");
  if (digits.length >= 9) {
    return digits.slice(-9);
  }
  return digits;
}

function distinctNonEmpty(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

/**
 * Conflits d'identité dans un groupe (2+ fiches).
 * Vide = fusion automatique OK (infos absentes ou identiques).
 */
export function getIdentityConflictMessages(
  contacts: ContactIdentityFields[]
): string[] {
  const reasons: string[] = [];

  const emails = distinctNonEmpty(contacts.map((c) => normalizeEmail(c.email)));
  if (emails.length > 1) {
    reasons.push("emails différents");
  }

  const phones = distinctNonEmpty(
    contacts.map((c) => normalizePhone(c.telephone)).filter((p) => p.length >= 9)
  );
  if (phones.length > 1) {
    reasons.push("téléphones différents");
  }

  return reasons;
}

export function isConfidentSamePerson(contacts: ContactIdentityFields[]): boolean {
  return getIdentityConflictMessages(contacts).length === 0;
}

/** Conflits entre une ligne d'import (ou PDF) et une fiche existante. */
export function getPairIdentityConflictMessages(
  incoming: ContactIdentityFields,
  existing: ContactIdentityFields
): string[] {
  return getIdentityConflictMessages([incoming, existing]);
}

export function formatIdentityLine(fields: ContactIdentityFields): string {
  const email = fields.email?.trim() || "—";
  const tel = fields.telephone?.trim() || "—";
  return `Email : ${email} · Tél : ${tel}`;
}
