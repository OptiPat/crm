import { normalizeString, PARTENAIRE_ALIASES, findMatchingPartenaire } from "@/lib/contacts/partenaire-match";
import type { Partenaire } from "@/lib/api/tauri-partenaires";

// Même logique que normalizeInvestmentLabel (rio-investissement-match) — copie locale pour éviter import circulaire.
function normalizeCompactLabel(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

/** Libellés contrats Stellium (RIO) → partenaire CRM (raison sociale canonique). */
export const RIO_STELLIUM_PRODUCT_PARTENAIRE: ReadonlyArray<{
  labelPatterns: readonly string[];
  partenaire: string;
}> = [
  { labelPatterns: ["cristallianceavenir"], partenaire: "vie plus" },
  { labelPatterns: ["cristallianceevoluvie"], partenaire: "apicil" },
  { labelPatterns: ["pertinenceretraite"], partenaire: "vie plus" },
];

function partenaireKeysMatch(a: string, b: string): boolean {
  const na = normalizeString(a);
  const nb = normalizeString(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) {
    return Math.min(na.length, nb.length) >= 4;
  }
  for (const [canonical, aliases] of Object.entries(PARTENAIRE_ALIASES)) {
    const keys = new Set([canonical, ...aliases].map(normalizeString));
    if (keys.has(na) && keys.has(nb)) return true;
  }
  return false;
}

/** Partenaire attendu pour un libellé extrait du RIO (ex. Cristalliance Avenir → Vie Plus). */
export function expectedPartenaireForRioLabel(label: string): string | null {
  const norm = normalizeCompactLabel(label);
  if (!norm) return null;
  for (const entry of RIO_STELLIUM_PRODUCT_PARTENAIRE) {
    if (entry.labelPatterns.some((pattern) => norm.includes(pattern) || norm === pattern)) {
      return entry.partenaire;
    }
  }
  return null;
}

/** Score de rapprochement libellé RIO ↔ nom produit / partenaire CRM. */
export function scoreRioPartenaireProductMatch(
  rioLabel: string,
  existingNomProduit: string,
  partenaireNom?: string | null
): number {
  const expected = expectedPartenaireForRioLabel(rioLabel);
  if (!expected) return 0;

  if (partenaireNom && partenaireKeysMatch(expected, partenaireNom)) {
    return 75;
  }
  if (partenaireKeysMatch(expected, existingNomProduit)) {
    return 60;
  }
  return 0;
}

/** Pré-sélection partenaire CRM pour un libellé contrat RIO (ex. Cristalliance Avenir → id Vie Plus). */
export function resolvePartenaireIdForRioLabel(
  label: string,
  partenaires: readonly Partenaire[]
): number | null {
  const expected = expectedPartenaireForRioLabel(label);
  if (!expected) return null;
  return findMatchingPartenaire(expected, [...partenaires])?.id ?? null;
}

export { partenaireKeysMatch };
