import type { ExtractedData } from "../types";
import { computeStelliumConfidence } from "./confidence";
import { normalizeStelliumText } from "./normalize";
import { extractFieldValue, getSection, splitStelliumSections } from "./sections";

/** Profils Stellium (échelle 1–5) → SRI CRM (1–7). */
const STELLIUM_PROFILE_TO_SRI: Readonly<Record<string, number>> = {
  sécurisé: 1,
  securise: 1,
  prudent: 2,
  équilibré: 3,
  equilibre: 3,
  dynamique: 4,
  offensif: 6,
};

const KNOWLEDGE_TO_LEVEL: Readonly<Record<string, string>> = {
  novice: "Faible",
  informé: "Moyen",
  informe: "Moyen",
  expérimenté: "Élevé",
  experimente: "Élevé",
};

function splitNomPrenom(value: string): { nom?: string; prenom?: string } {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return {};
  return {
    prenom: parts[parts.length - 1],
    nom: parts.slice(0, -1).join(" "),
  };
}

function normalizeProfileLabel(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function extractProfilRisqueLabel(text: string): string | undefined {
  const summary = text.match(
    /profil de risque[\s\S]{0,220}?est\s+(Sécurisé|Prudent|Équilibré|Dynamique|Offensif)\s*\./i
  );
  if (summary?.[1]) return summary[1];

  const tolerance = text.match(
    /Tolérance au risque\s+(Sécurisé|Prudent|Équilibré|Dynamique|Offensif)\s*\(\d\/5\)/i
  );
  return tolerance?.[1];
}

function mapProfilToSri(label: string | undefined): number | undefined {
  if (!label) return undefined;
  return STELLIUM_PROFILE_TO_SRI[normalizeProfileLabel(label)];
}

function extractConnaissanceLevel(text: string): string | undefined {
  const checked = text.match(/(?:✓|☑)\s*(Novice|Informé|Expérimenté)(?=\s|$)/i);
  const raw = checked?.[1];
  if (!raw) return undefined;
  return KNOWLEDGE_TO_LEVEL[normalizeProfileLabel(raw)] ?? raw;
}

function extractExperienceLabel(text: string): string | undefined {
  const checked = text.match(/(?:✓|☑)\s*(Novice|Informé|Expérimenté)(?=\s|$)/i);
  return checked?.[1];
}

/**
 * Parse un Profil investisseur (QPI) Stellium.
 */
export function parseStelliumQpi(rawText: string): ExtractedData {
  const text = normalizeStelliumText(rawText);
  const sections = splitStelliumSections(text);
  const header = getSection(sections, "header");
  const profilSection = getSection(sections, "profilRisque") || text.slice(0, 2500);

  const data: ExtractedData = {
    typeDocument: "QPI",
    raw: text,
  };

  const investisseur = extractFieldValue(header, ["Investisseur"], ["Le", "Conformément"]);
  if (investisseur) {
    const split = splitNomPrenom(investisseur);
    data.nom = split.nom;
    data.prenom = split.prenom;
  }

  const dateMatch = header.match(/\bLe\s+(\d{2}\/\d{2}\/\d{4})\b/i);
  if (dateMatch) {
    data.dateDocument = dateMatch[1];
  }

  const profilLabel = extractProfilRisqueLabel(profilSection);
  data.profilRisque = mapProfilToSri(profilLabel);
  data.aversionRisque = profilLabel;

  const connaissance = extractConnaissanceLevel(text.slice(0, 5000));
  if (connaissance) {
    data.connaissancesFinancieres = connaissance;
  }

  const experience = extractExperienceLabel(text.slice(0, 5000));
  if (experience) {
    data.experienceInvestissement = experience;
  }

  if (/ne souhaite pas préciser vos préférences en matière de durabilité/i.test(text)) {
    data.horizonPlacement = "Non précisé (ESG)";
  }

  data.confidence = computeStelliumConfidence(data, "QPI");
  return data;
}

export { mapProfilToSri, STELLIUM_PROFILE_TO_SRI };
