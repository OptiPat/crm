/** Filtre les valeurs OCR / MRZ manifestement invalides. */

const NAME_BLOCKLIST =
  /valable|jusqu|nationalit|identit|carte|r[eé]publique|fran[çc]ais|naissance|validit|signature|autorit[eé]|d[eé]livr[eé]|domicile|adresse|sexe|taille|mrz|passeport/i;

const PLACE_BLOCKLIST =
  /^(.*\b)?(fran[çc]ais[e]?|ancaise|nationalit[eé]|sex[eé]|masculin|f[eé]minin|taille|valable|signature|europ[eé]enne)\b/i;

const DATE_IN_TEXT =
  /\d{1,2}[\s./-]\d{1,2}[\s./-]\d{2,4}|\d{2}\s+\d{2}\s+\d{4}/;

export function isPlausiblePersonName(value?: string | null): boolean {
  if (!value) return false;
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (trimmed.length < 2 || trimmed.length > 50) return false;
  if (/\d/.test(trimmed)) return false;
  if (DATE_IN_TEXT.test(trimmed)) return false;
  if (NAME_BLOCKLIST.test(trimmed)) return false;
  if (!/[A-Za-zÀ-ü]/.test(trimmed)) return false;
  const letters = trimmed.replace(/[^A-Za-zÀ-ü]/g, "");
  if (letters.length < 2) return false;
  return true;
}

export function isPlausibleBirthPlace(value?: string | null): boolean {
  if (!value) return false;
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (trimmed.length < 2 || trimmed.length > 80) return false;
  if (/^\d/.test(trimmed)) return false;
  if (PLACE_BLOCKLIST.test(trimmed)) return false;
  if (DATE_IN_TEXT.test(trimmed)) return false;
  if (!/[A-Za-zÀ-ü]/.test(trimmed)) return false;
  return true;
}

export function sanitizePersonName(value?: string): string | undefined {
  if (!isPlausiblePersonName(value)) return undefined;
  return value!.replace(/\s+/g, " ").trim();
}

export function sanitizeBirthPlace(value?: string): string | undefined {
  if (!isPlausibleBirthPlace(value)) return undefined;
  return value!.replace(/\s+/g, " ").trim();
}
