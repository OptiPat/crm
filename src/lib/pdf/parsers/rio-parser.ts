// Parser spécifique pour les RIO (Recueil d'Informations et d'Objectifs)
import type { ExtractedData } from "../types";
import { parseGeneric } from "./generic-parser";
import { parseRIOAdvanced } from "./rio-parser-advanced";
import { parsePatrimoineRIO } from "./rio-parser-patrimoine";

/**
 * Détecte si un texte est un RIO
 */
export function isRIO(text: string): boolean {
  const head = text.slice(0, 600).toLowerCase();
  if (head.includes("profil investisseur")) return false;
  return (
    head.includes("recueil") &&
    (head.includes("information") || head.includes("patrimonial"))
  );
}

/**
 * Extrait les revenus du RIO
 */
function extractRevenus(text: string): number | undefined {
  // Pattern: "Revenus annuels : 45000" ou "Revenus : 45 000 €"
  const patterns = [
    /Revenus?\s+annuels?\s*:\s*\*?\s*([\d\s]+)/i,
    /Revenus?\s*:\s*\*?\s*([\d\s]+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const revenus = match[1].replace(/\s/g, "");
      return parseInt(revenus, 10);
    }
  }

  return undefined;
}

/**
 * Extrait le patrimoine du RIO
 */
function extractPatrimoine(text: string): number | undefined {
  // Pattern: "Patrimoine : 250000" ou "Patrimoine global : 250 000 €"
  const patterns = [
    /Patrimoine\s+global\s*:\s*\*?\s*([\d\s]+)/i,
    /Patrimoine\s*:\s*\*?\s*([\d\s]+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const patrimoine = match[1].replace(/\s/g, "");
      return parseInt(patrimoine, 10);
    }
  }

  return undefined;
}

/**
 * Extrait le profil de risque (SRI 1-7)
 */
function extractProfilRisque(text: string): number | undefined {
  // Pattern: "Profil de risque : 5" ou "SRI : 4"
  const patterns = [
    /Profil\s+de\s+risque\s*:\s*\*?\s*([1-7])/i,
    /SRI\s*:\s*\*?\s*([1-7])/i,
    /Indicateur\s+de\s+risque\s*:\s*\*?\s*([1-7])/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return parseInt(match[1], 10);
    }
  }

  return undefined;
}

/**
 * Détecte la présence d'un conjoint dans le RIO
 */
function detectConjoint(text: string): boolean {
  const normalizedText = text.toLowerCase();
  return (
    normalizedText.includes("conjoint") ||
    normalizedText.includes("co-titulaire") ||
    normalizedText.includes("époux") ||
    normalizedText.includes("épouse") ||
    (normalizedText.includes("madame") && normalizedText.includes("monsieur"))
  );
}

/**
 * Extrait les données du conjoint si présent
 */
function extractConjoint(text: string): ExtractedData["conjoint"] | undefined {
  if (!detectConjoint(text)) {
    return undefined;
  }

  // Chercher "Conjoint : Nom Prénom"
  const pattern =
    /Conjoint\s*:\s*\*?\s*(?:([MmeMme\.]+)\s+)?([A-ZÀ-Ü][A-ZÀ-Ü\s-]+)\s+([A-ZÀ-Ü][a-zà-ü]+)/i;
  const match = text.match(pattern);

  if (match) {
    return {
      civilite: match[1]
        ? match[1].toLowerCase().includes("mme")
          ? "MME"
          : "M"
        : undefined,
      nom: match[2].trim(),
      prenom: match[3].trim(),
    };
  }

  return {
    // Informations partielles si pattern complet pas trouvé
  };
}

/**
 * Parse un RIO et extrait toutes les données spécifiques
 */
export function parseRIO(text: string): ExtractedData {
  // Commencer par le parsing générique
  const genericData = parseGeneric(text);

  // Ajouter les données basiques du RIO
  const revenus = extractRevenus(text);
  const patrimoine = extractPatrimoine(text);
  const profilRisque = extractProfilRisque(text);
  const conjoint = extractConjoint(text);

  // Ajouter les données avancées du RIO
  const advancedData = parseRIOAdvanced(text);

  // Ajouter le patrimoine détaillé
  const patrimoineData = parsePatrimoineRIO(text);

  // Fusionner toutes les données
  const allData = {
    ...genericData,
    ...advancedData,
    ...patrimoineData,
    revenus,
    patrimoine,
    profilRisque,
    conjoint,
  };

  // Compter le nombre de champs trouvés pour calculer la confiance
  const fieldsFound = Object.values(allData).filter(
    (v) => v !== undefined && v !== null && v !== "" && (typeof v !== 'object' || Object.keys(v).length > 0)
  ).length;
  const totalPossibleFields = 25; // Estimation des champs importants
  const confidence = Math.min(100, Math.round((fieldsFound / totalPossibleFields) * 100));

  return {
    ...allData,
    confidence,
  };
}
