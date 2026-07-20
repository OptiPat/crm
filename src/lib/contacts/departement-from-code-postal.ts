import type { Contact } from "@/lib/api/tauri-contacts";
import { frenchDepartementName } from "./french-departements";

export const GEOGRAPHY_UNSET_KEY = "__UNSET__";
export const GEOGRAPHY_FOREIGN_KEY = "__FOREIGN__";
export const GEOGRAPHY_COUNTRY_KEY_PREFIX = "country:";

export const GEOGRAPHY_UNSET_LABEL = "Non renseigné";
export const GEOGRAPHY_FOREIGN_LABEL = "Hors France";

const FRANCE_COUNTRY_KEYS = new Set(["france", "fr", "republique francaise"]);

/** Territoires français reconnus (DOM-TOM / COM) — traités comme France pour la géographie. */
const FRENCH_TERRITORY_KEYS = new Set([
  "guadeloupe",
  "martinique",
  "guyane",
  "la reunion",
  "reunion",
  "mayotte",
  "polynesie francaise",
  "nouvelle caledonie",
  "saint pierre et miquelon",
  "saint barthelemy",
  "saint martin",
  "wallis et futuna",
  "terres australes et antarctiques francaises",
]);

const TERRITORY_TO_DEPT: Record<string, string> = {
  guadeloupe: "971",
  martinique: "972",
  guyane: "973",
  "la reunion": "974",
  reunion: "974",
  mayotte: "976",
  "polynesie francaise": "987",
  "nouvelle caledonie": "988",
  "saint pierre et miquelon": "975",
  "saint barthelemy": "977",
  "saint martin": "978",
  "wallis et futuna": "986",
};

const COUNTRY_LABEL_ALIASES: Record<string, string> = {
  "royaume-uni": "Royaume-Uni",
  "united kingdom": "Royaume-Uni",
  uk: "Royaume-Uni",
  "etats-unis": "États-Unis",
  "etats unis": "États-Unis",
  usa: "États-Unis",
  "united states": "États-Unis",
  suisse: "Suisse",
  belgique: "Belgique",
  luxembourg: "Luxembourg",
  espagne: "Espagne",
  italie: "Italie",
  allemagne: "Allemagne",
  portugal: "Portugal",
  canada: "Canada",
  maroc: "Maroc",
  tunisie: "Tunisie",
  algerie: "Algérie",
};

/** Normalise un libellé pays pour comparaison / clé. */
export function normalizeCountryKey(pays: string): string {
  return pays
    .trim()
    .toLocaleLowerCase("fr")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/['']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isFrancePays(pays?: string | null): boolean {
  const trimmed = pays?.trim();
  if (!trimmed) return true;
  const key = normalizeCountryKey(trimmed);
  return FRANCE_COUNTRY_KEYS.has(key) || FRENCH_TERRITORY_KEYS.has(key);
}

export function isForeignCountryGeographyKey(key: string): boolean {
  return key.startsWith(GEOGRAPHY_COUNTRY_KEY_PREFIX);
}

export function geographyForeignCountryKey(pays?: string | null): string {
  const trimmed = pays?.trim();
  if (!trimmed) return GEOGRAPHY_FOREIGN_KEY;
  return `${GEOGRAPHY_COUNTRY_KEY_PREFIX}${normalizeCountryKey(trimmed)}`;
}

function overseasDeptFromPays(pays?: string | null): string | null {
  if (!pays?.trim()) return null;
  return TERRITORY_TO_DEPT[normalizeCountryKey(pays)] ?? null;
}

/** Normalise un code postal français sur 5 chiffres. */
export function normalizeFrenchPostalCode(raw?: string | null): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 5) return null;
  return digits.slice(0, 5);
}

/** Extrait le code département INSEE depuis un code postal français. */
export function departementCodeFromCodePostal(codePostal?: string | null): string | null {
  const normalized = normalizeFrenchPostalCode(codePostal);
  if (!normalized) return null;

  if (normalized.startsWith("97") || normalized.startsWith("98")) {
    return normalized.slice(0, 3);
  }

  if (normalized.startsWith("20")) {
    const num = Number.parseInt(normalized, 10);
    if (num >= 20000 && num <= 20199) return "2A";
    if (num >= 20200 && num <= 20620) return "2B";
    return null;
  }

  return normalized.slice(0, 2);
}

/** Clé de groupement géographique pour un contact (département, pays étranger, non renseigné). */
export function geographyGroupKeyFromContact(
  contact: Pick<Contact, "code_postal" | "pays">
): string {
  if (!isFrancePays(contact.pays)) {
    return geographyForeignCountryKey(contact.pays);
  }
  const dept = departementCodeFromCodePostal(contact.code_postal);
  if (dept) return dept;
  const overseas = overseasDeptFromPays(contact.pays);
  if (overseas) return overseas;
  return GEOGRAPHY_UNSET_KEY;
}

export function formatCountryKeyToLabel(countryKey: string): string {
  return COUNTRY_LABEL_ALIASES[countryKey] ?? countryKey
    .split(/[-\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function geographyGroupLabel(key: string): string {
  if (key === GEOGRAPHY_UNSET_KEY) return GEOGRAPHY_UNSET_LABEL;
  if (key === GEOGRAPHY_FOREIGN_KEY) return GEOGRAPHY_FOREIGN_LABEL;
  if (isForeignCountryGeographyKey(key)) {
    return formatCountryKeyToLabel(key.slice(GEOGRAPHY_COUNTRY_KEY_PREFIX.length));
  }
  const name = frenchDepartementName(key);
  return name ? `${name} (${key})` : key;
}

/** Libellé d'affichage en conservant la saisie utilisateur pour les pays étrangers. */
export function geographyGroupLabelFromContact(
  contact: Pick<Contact, "code_postal" | "pays">
): string {
  const key = geographyGroupKeyFromContact(contact);
  if (isForeignCountryGeographyKey(key) && contact.pays?.trim()) {
    return contact.pays.trim();
  }
  return geographyGroupLabel(key);
}
