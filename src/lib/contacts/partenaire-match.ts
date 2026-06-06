// Rapprochement « flou » (fuzzy matching) des partenaires lors de l'import :
// normalisation, alias connus, correspondance partielle et distance de Levenshtein.
// Logique pure, extraite de ContactImport pour être testable et réutilisable.

import type { Partenaire } from "@/lib/api/tauri-partenaires";

/** Normalise : minuscules, sans accents, caractères spéciaux -> espaces, espaces réduits. */
export const normalizeString = (str: string): string => {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

/** Variations courantes connues par partenaire (clé = forme canonique). */
export const PARTENAIRE_ALIASES: Record<string, string[]> = {
  "vie plus": ["vie+", "vie +", "vieplus"],
  apicil: ["apcil", "apicill", "appicil"],
  primonial: ["primoniale", "primmonial"],
  praemia: ["praemie", "praémia", "premia"],
  generali: ["generalli", "générali"],
  suravenir: ["suravnir", "suravennir"],
  "swiss life": ["swisslife", "swiss-life", "suisse life"],
  cardif: ["kardif", "carrdif"],
  spirica: ["spiricca", "sprica"],
  corum: ["corrum", "coorum"],
  sofidy: ["sofiddy", "soffidy"],
  perial: ["périal", "periall"],
  "la francaise": ["la française", "lafrancaise"],
  "epargne pierre": ["épargne pierre", "epargnepierre"],
  primovie: ["primo vie", "primo-vie"],
  "ncap regions": ["n cap regions", "ncap régions", "n-cap regions"],
};

/** Distance de Levenshtein (détection des fautes de frappe). */
export const levenshteinDistance = (a: string, b: string): number => {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
};

/** Trouve le partenaire le plus proche du nom recherché, ou `null`. */
export const findMatchingPartenaire = (
  searchName: string,
  partenaires: Partenaire[]
): Partenaire | null => {
  const normalizedSearch = normalizeString(searchName);

  // 1. Correspondance exacte (après normalisation)
  for (const p of partenaires) {
    if (normalizeString(p.raison_sociale) === normalizedSearch) {
      return p;
    }
  }

  // 2. Alias connus
  for (const [canonical, aliases] of Object.entries(PARTENAIRE_ALIASES)) {
    if (
      aliases.some((alias) => normalizeString(alias) === normalizedSearch) ||
      normalizeString(canonical) === normalizedSearch
    ) {
      for (const p of partenaires) {
        const normalizedP = normalizeString(p.raison_sociale);
        if (
          normalizedP === normalizeString(canonical) ||
          aliases.some((alias) => normalizeString(alias) === normalizedP)
        ) {
          return p;
        }
      }
    }
  }

  // 3. Correspondance partielle (inclusion)
  for (const p of partenaires) {
    const normalizedP = normalizeString(p.raison_sociale);
    if (normalizedP.includes(normalizedSearch) || normalizedSearch.includes(normalizedP)) {
      if (normalizedSearch.length >= 4 && normalizedP.length >= 4) {
        return p;
      }
    }
  }

  // 4. Distance de Levenshtein (fautes de frappe)
  let bestMatch: Partenaire | null = null;
  let bestDistance = Infinity;
  const maxDistance = Math.max(2, Math.floor(normalizedSearch.length * 0.3));

  for (const p of partenaires) {
    const normalizedP = normalizeString(p.raison_sociale);
    const distance = levenshteinDistance(normalizedSearch, normalizedP);

    if (distance < bestDistance && distance <= maxDistance) {
      bestDistance = distance;
      bestMatch = p;
    }
  }

  return bestMatch;
};

/** Déduit le type de partenaire à partir du type de produit. */
export const deduireTypePartenaire = (typeProduit: string): string => {
  const t = typeProduit.toUpperCase();
  if (t.includes("AV") || t.includes("ASSURANCE") || t.includes("VIE") || t.includes("PER")) {
    return "ASSUREUR";
  } else if (t.includes("PINEL") || t.includes("IMMOBILIER") || t.includes("MALRAUX")) {
    return "PROMOTEUR";
  } else if (
    t.includes("FCPR") ||
    t.includes("FPCI") ||
    t.includes("FIP") ||
    t.includes("FCPI") ||
    t.includes("G3F")
  ) {
    return "SOCIETE_GESTION_FIP";
  } else {
    return "SOCIETE_GESTION_SCPI";
  }
};
