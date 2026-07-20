import type { Contact } from "@/lib/api/tauri-contacts";
import { frenchDepartementName } from "./french-departements";

export const GEOGRAPHY_UNSET_KEY = "__UNSET__";
export const GEOGRAPHY_FOREIGN_KEY = "__FOREIGN__";

export const GEOGRAPHY_UNSET_LABEL = "Non renseigné";
export const GEOGRAPHY_FOREIGN_LABEL = "Hors France";

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

function isFrancePays(pays?: string | null): boolean {
  const trimmed = pays?.trim();
  if (!trimmed) return true;
  const lower = trimmed.toLocaleLowerCase("fr");
  return lower === "france" || lower === "fr";
}

/** Clé de groupement géographique pour un contact (département, hors France, non renseigné). */
export function geographyGroupKeyFromContact(
  contact: Pick<Contact, "code_postal" | "pays">
): string {
  if (!isFrancePays(contact.pays)) return GEOGRAPHY_FOREIGN_KEY;
  const dept = departementCodeFromCodePostal(contact.code_postal);
  return dept ?? GEOGRAPHY_UNSET_KEY;
}

export function geographyGroupLabel(key: string): string {
  if (key === GEOGRAPHY_UNSET_KEY) return GEOGRAPHY_UNSET_LABEL;
  if (key === GEOGRAPHY_FOREIGN_KEY) return GEOGRAPHY_FOREIGN_LABEL;
  const name = frenchDepartementName(key);
  return name ? `${name} (${key})` : key;
}
