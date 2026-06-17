import type { ExtractedData } from "../types";

type ConfidenceField = keyof ExtractedData | "enfantsList" | "biensList" | "conjointEmail" | "conjointNom";

const RIO_WEIGHTS: Readonly<Partial<Record<ConfidenceField, number>>> = {
  nom: 10,
  prenom: 10,
  dateNaissance: 8,
  email: 6,
  telephone: 6,
  adresse: 5,
  codePostal: 3,
  ville: 3,
  profession: 5,
  employeur: 3,
  revenusTotal: 8,
  chargesTotal: 6,
  patrimoineTotal: 8,
  compteCourant: 4,
  assuranceVie: 4,
  biensList: 6,
  enfantsList: 4,
  objectifsPrincipaux: 4,
  dateEntreeRelation: 3,
  dateSignature: 4,
  conjointEmail: 3,
  conjointNom: 3,
};

const QPI_WEIGHTS: Readonly<Partial<Record<ConfidenceField, number>>> = {
  nom: 10,
  prenom: 10,
  profilRisque: 15,
  connaissancesFinancieres: 12,
  experienceInvestissement: 8,
  sensibiliteExtraFinanciere: 8,
  dateSignature: 8,
  dateDocument: 4,
};

function hasValue(data: ExtractedData, field: ConfidenceField): boolean {
  if (field === "biensList") {
    return (data.biensImmobiliers?.length ?? 0) > 0;
  }
  if (field === "enfantsList") {
    return (data.enfants?.length ?? 0) > 0;
  }
  if (field === "conjointEmail") {
    return Boolean(data.conjoint?.email);
  }
  if (field === "conjointNom") {
    return Boolean(data.conjoint?.nom && data.conjoint?.prenom);
  }
  const value = data[field as keyof ExtractedData];
  if (value === undefined || value === null || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

export function computeStelliumConfidence(
  data: ExtractedData,
  kind: "RIO" | "QPI"
): number {
  const weights = kind === "RIO" ? RIO_WEIGHTS : QPI_WEIGHTS;
  let score = 0;
  let max = 0;

  for (const [field, weight] of Object.entries(weights)) {
    max += weight!;
    if (hasValue(data, field as ConfidenceField)) {
      score += weight!;
    }
  }

  if (max === 0) return 0;
  return Math.min(100, Math.round((score / max) * 100));
}
