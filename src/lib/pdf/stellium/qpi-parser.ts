import type { ExtractedData } from "../types";
import { computeStelliumConfidence } from "./confidence";
import { extractStelliumSignatureDate } from "./signature-date";
import { normalizeStelliumText } from "./normalize";
import { extractFieldValue, getSection, splitStelliumSections } from "./sections";

/** Profils Stellium QPI (échelle 1–5) → profil CRM (1–5). */
const STELLIUM_PROFILE_TO_SRI: Readonly<Record<string, number>> = {
  sécurisé: 1,
  securise: 1,
  prudent: 2,
  équilibré: 3,
  equilibre: 3,
  dynamique: 4,
  offensif: 5,
};

const EXPERIENCE_LEVELS = ["Novice", "Informé", "Expérimenté"] as const;
type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number];

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

/** Niveau QPI : Novice, Informé ou Expérimenté (coche immédiatement avant le libellé retenu). */
export function extractExperienceLevel(text: string): ExperienceLevel | undefined {
  const noviceIdx = text.search(/\bNovice\b/i);
  if (noviceIdx < 0) return undefined;
  const slice = text.slice(Math.max(0, noviceIdx - 20), noviceIdx + 140);

  const checked = slice.match(/(?:✓|☑)\s*(Novice|Informé|Expérimenté)(?=\s|$)/i);
  if (!checked?.[1]) return undefined;

  const key = normalizeProfileLabel(checked[1]);
  const map: Readonly<Record<string, ExperienceLevel>> = {
    novice: "Novice",
    informe: "Informé",
    experimente: "Expérimenté",
  };
  return map[key];
}

/** Première phrase de la section « Sensibilité extra-financière » (résumé durabilité / ESG). */
export function extractSensibiliteExtraFinanciere(text: string): string | undefined {
  const pattern =
    /Sensibilit[eé]\s+extra[- ]financi[eè]re\s+((?:Vous|Je)\s+.+?)(?=\s+(?:La notion|Profil investisseur|Protection des données|Vos réponses)|$)/gi;
  let result: string | undefined;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const phrase = match[1].replace(/\s+/g, " ").trim();
    if (/sur des éléments de durabilit[eé]/i.test(phrase)) continue;
    result = phrase;
  }
  return result;
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

  const dateSignature = extractStelliumSignatureDate(text, "QPI");
  if (dateSignature) {
    data.dateSignature = dateSignature;
  }

  const profilLabel = extractProfilRisqueLabel(profilSection);
  data.profilRisque = mapProfilToSri(profilLabel);
  data.aversionRisque = profilLabel;

  const experience = extractExperienceLevel(text.slice(0, 5000));
  if (experience) {
    data.experienceInvestissement = experience;
  }

  const sensibilite = extractSensibiliteExtraFinanciere(text);
  if (sensibilite) {
    data.sensibiliteExtraFinanciere = sensibilite;
  }

  data.confidence = computeStelliumConfidence(data, "QPI");
  return data;
}

export { mapProfilToSri, STELLIUM_PROFILE_TO_SRI };
