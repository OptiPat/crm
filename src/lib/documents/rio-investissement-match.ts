import type { Investissement } from "@/lib/api/tauri-investissements";
import { getEffectiveEncoursCentimes } from "@/lib/investissements/investissement-encours";
import { usesRioEncoursMontant } from "@/lib/documents/rio-investissement-extras";
import { isImmobilierFinancingType } from "@/lib/investissements/investissement-immo-financing";
import {
  expectedPartenaireForRioLabel,
  partenaireKeysMatch,
  scoreRioPartenaireProductMatch,
} from "@/lib/documents/rio-product-partenaire";
import type { Partenaire } from "@/lib/api/tauri-partenaires";

export interface RioExtractedInvestissement {
  id: string;
  type: string;
  label: string;
  montant: number;
}

const COMPATIBLE_TYPES: Record<string, readonly string[]> = {
  IMMOBILIER: ["IMMOBILIER", "LMNP", "LMP", "PINEL", "RP", "RS", "LOCATIF", "RESIDENCE_PRINCIPALE", "RESIDENCE_SECONDAIRE", "CLASSIQUE"],
  LOCATIF: ["IMMOBILIER", "LMNP", "LMP", "PINEL", "LOCATIF", "CLASSIQUE"],
  CLASSIQUE: ["IMMOBILIER", "LMNP", "LMP", "PINEL", "LOCATIF", "CLASSIQUE"],
  PINEL: ["IMMOBILIER", "LMNP", "LMP", "PINEL", "LOCATIF"],
  LMNP: ["IMMOBILIER", "LMNP", "LMP", "PINEL", "LOCATIF"],
  LMP: ["IMMOBILIER", "LMNP", "LMP", "PINEL", "LOCATIF"],
  RP: ["IMMOBILIER", "RP", "RESIDENCE_PRINCIPALE"],
  RESIDENCE_PRINCIPALE: ["IMMOBILIER", "RP", "RESIDENCE_PRINCIPALE"],
  RS: ["IMMOBILIER", "RS", "RESIDENCE_SECONDAIRE"],
  RESIDENCE_SECONDAIRE: ["IMMOBILIER", "RS", "RESIDENCE_SECONDAIRE"],
  ASSURANCE_VIE: ["ASSURANCE_VIE"],
  PER: ["PER"],
  PERP: ["PERP"],
  PEA: ["PEA"],
  COMPTE_TITRE: ["COMPTE_TITRE"],
  SCPI: ["SCPI", "SCPI_DEMEMBREMENT", "SCPI_FISCALE"],
  SCPI_DEMEMBREMENT: ["SCPI", "SCPI_DEMEMBREMENT", "SCPI_FISCALE"],
  SCPI_FISCALE: ["SCPI", "SCPI_DEMEMBREMENT", "SCPI_FISCALE"],
  EPARGNE_BANCAIRE: ["EPARGNE_BANCAIRE", "COMPTE_COURANT"],
  COMPTE_COURANT: ["EPARGNE_BANCAIRE", "COMPTE_COURANT"],
  LIVRET_A: ["LIVRET_A"],
  LDDS: ["LDDS", "LDD"],
  LDD: ["LDDS", "LDD"],
  LEP: ["LEP"],
  PEL: ["PEL"],
  CEL: ["CEL"],
  CSL: ["CSL"],
  AUTRE: ["AUTRE"],
};

const GENERIC_EPARGNE_TYPES = new Set([
  "EPARGNE_BANCAIRE",
  "COMPTE_COURANT",
  "LIVRET_A",
  "LDDS",
  "LDD",
  "LEP",
  "PEL",
  "CEL",
  "CSL",
]);

const SINGLETON_IMMO_TYPES = new Set([
  "RP",
  "RESIDENCE_PRINCIPALE",
  "RS",
  "RESIDENCE_SECONDAIRE",
]);

const SINGLETON_FINANCIAL_TYPES = new Set(["PER", "PEA", "PERP"]);

export type RioMatchContext = {
  partenaireNomById?: ReadonlyMap<number, string>;
};

type ImmoFamily = "rp" | "rs" | "locatif";

export function normalizeInvestmentLabel(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

export function isImmoProductType(type: string): boolean {
  return isImmobilierFinancingType(type) || SINGLETON_IMMO_TYPES.has(type);
}

export function typesAreCompatible(extractedType: string, existingType: string): boolean {
  if (extractedType === existingType) return true;
  const compatible = COMPATIBLE_TYPES[extractedType];
  if (compatible?.includes(existingType)) return true;
  const reverse = COMPATIBLE_TYPES[existingType];
  if (reverse?.includes(extractedType)) return true;
  return Object.values(COMPATIBLE_TYPES).some(
    (types) => types.includes(extractedType) && types.includes(existingType)
  );
}

export function referenceMontantEuro(inv: Investissement, typeForEncours = inv.type_produit): number {
  if (usesRioEncoursMontant(typeForEncours)) {
    return getEffectiveEncoursCentimes(inv) / 100;
  }
  return inv.montant_initial ? inv.montant_initial / 100 : 0;
}

function immoFamily(type: string): ImmoFamily | null {
  if (type === "RP" || type === "RESIDENCE_PRINCIPALE") return "rp";
  if (type === "RS" || type === "RESIDENCE_SECONDAIRE") return "rs";
  if (["LOCATIF", "LMNP", "LMP", "PINEL", "IMMOBILIER", "CLASSIQUE"].includes(type)) {
    return "locatif";
  }
  return null;
}

function isGenericRpLabel(normalized: string): boolean {
  return (
    !normalized ||
    normalized === "rp" ||
    normalized.includes("residenceprincipale") ||
    normalized.includes("residenceprincip")
  );
}

function isGenericRsLabel(normalized: string): boolean {
  return (
    !normalized ||
    normalized === "rs" ||
    normalized.includes("residencesecondaire") ||
    normalized.includes("residencesecond")
  );
}

function isGenericLocatifLabel(normalized: string): boolean {
  return (
    !normalized ||
    normalized === "locatif" ||
    normalized === "immobilier" ||
    normalized.includes("immobilierlocatif") ||
    normalized.includes("biendirect") ||
    normalized.includes("locatifnu")
  );
}

export function isGenericImmoLabel(type: string, label: string): boolean {
  const family = immoFamily(type);
  if (!family) return false;
  const normalized = normalizeInvestmentLabel(label);
  if (family === "rp") return isGenericRpLabel(normalized);
  if (family === "rs") return isGenericRsLabel(normalized);
  return isGenericLocatifLabel(normalized);
}

function livretVariantKey(normalized: string): string {
  if (!normalized) return "generic";
  if (normalized.includes("enfant")) return "enfants";
  if (
    normalized === "la" ||
    normalized === "livreta" ||
    normalized === "livret" ||
    (normalized.startsWith("la") && normalized.length <= 4)
  ) {
    return "standard";
  }
  return normalized;
}

function canonicalEpargneLabelKey(type: string, normalized: string): string {
  if (type === "LIVRET_A") return livretVariantKey(normalized);
  if (type === "LDDS" || type === "LDD") {
    if (normalized === "ldd" || normalized === "ldds") return "standard";
    return normalized || "standard";
  }
  if (type === "EPARGNE_BANCAIRE" || type === "COMPTE_COURANT") {
    if (normalized.includes("courant")) return "courant";
    return normalized || "standard";
  }
  return normalized;
}

/** Clé de rapprochement : libellé générique (RP, locatif…) ou nom propre normalisé. */
function canonicalMatchKey(type: string, label: string): string {
  const normalized = normalizeInvestmentLabel(label);
  const family = immoFamily(type);
  if (family) {
    if (family === "rp" && isGenericRpLabel(normalized)) return "immo:rp";
    if (family === "rs" && isGenericRsLabel(normalized)) return "immo:rs";
    if (family === "locatif" && isGenericLocatifLabel(normalized)) return "immo:locatif";
    return `immo:named:${normalized}`;
  }
  if (GENERIC_EPARGNE_TYPES.has(type)) {
    return `epargne:${canonicalEpargneLabelKey(type, normalized)}`;
  }
  return normalized;
}

function scoreLabelSimilarity(
  extractedType: string,
  extractedLabel: string,
  existingType: string,
  existingLabel: string
): number {
  const extractedNorm = normalizeInvestmentLabel(extractedLabel);
  const existingNorm = normalizeInvestmentLabel(existingLabel);

  if (!extractedNorm && !existingNorm) return 25;
  if (extractedNorm === existingNorm) return 100;

  if (
    extractedNorm &&
    existingNorm &&
    (extractedNorm.includes(existingNorm) || existingNorm.includes(extractedNorm))
  ) {
    return 55;
  }

  if (
    extractedNorm.length >= 4 &&
    existingNorm.length >= 4 &&
    extractedNorm.substring(0, 6) === existingNorm.substring(0, 6)
  ) {
    return 35;
  }

  const extractedKey = canonicalMatchKey(extractedType, extractedLabel);
  const existingKey = canonicalMatchKey(existingType, existingLabel);
  if (extractedKey === existingKey && !extractedKey.endsWith(":")) {
    return 50;
  }

  const extractedFamily = immoFamily(extractedType);
  const existingFamily = immoFamily(existingType);
  if (
    extractedFamily &&
    existingFamily &&
    extractedFamily === existingFamily &&
    extractedKey.startsWith("immo:") &&
    existingKey.startsWith("immo:") &&
    extractedKey === existingKey
  ) {
    return 50;
  }

  if (GENERIC_EPARGNE_TYPES.has(extractedType)) {
    const eKey = canonicalEpargneLabelKey(extractedType, extractedNorm);
    const xKey = canonicalEpargneLabelKey(existingType, existingNorm);
    if (eKey === xKey && eKey !== "generic") return 50;
  }

  return 0;
}

function scoreAmountProximity(
  extractedMontant: number,
  existingMontant: number,
  options?: { immo?: boolean }
): number {
  if (extractedMontant <= 0 || existingMontant <= 0) return 0;
  const diff = Math.abs(extractedMontant - existingMontant);
  const tight = options?.immo
    ? Math.max(5_000, extractedMontant * 0.03)
    : Math.max(500, extractedMontant * 0.02);
  if (diff <= tight) return 45;
  const loose = options?.immo
    ? Math.max(25_000, extractedMontant * 0.1)
    : Math.max(2_000, extractedMontant * 0.08);
  if (diff <= loose) return 25;
  return 0;
}

function isAmountPrimaryMatch(extracted: RioExtractedInvestissement): boolean {
  if (GENERIC_EPARGNE_TYPES.has(extracted.type)) return true;
  if (isGenericImmoLabel(extracted.type, extracted.label)) return true;
  if (SINGLETON_IMMO_TYPES.has(extracted.type)) return true;
  const norm = normalizeInvestmentLabel(extracted.label);
  return norm.length <= 4;
}

function minScoreForMatch(extracted: RioExtractedInvestissement): number {
  if (isAmountPrimaryMatch(extracted)) return 70;
  if (SINGLETON_FINANCIAL_TYPES.has(extracted.type)) return 75;
  return 80;
}

function partenaireNomFor(
  inv: Investissement,
  context?: RioMatchContext
): string | null {
  if (inv.partenaire_id == null || !context?.partenaireNomById) return null;
  return context.partenaireNomById.get(inv.partenaire_id) ?? null;
}

export function scoreRioInvestissementMatch(
  extracted: RioExtractedInvestissement,
  existing: Investissement,
  context?: RioMatchContext
): number {
  if (!typesAreCompatible(extracted.type, existing.type_produit)) return 0;

  const immo = isImmoProductType(extracted.type) || isImmoProductType(existing.type_produit);
  let score = 35;
  score += scoreLabelSimilarity(
    extracted.type,
    extracted.label,
    existing.type_produit,
    existing.nom_produit
  );
  score += scoreRioPartenaireProductMatch(
    extracted.label,
    existing.nom_produit,
    partenaireNomFor(existing, context)
  );
  score += scoreAmountProximity(
    extracted.montant,
    referenceMontantEuro(existing, extracted.type),
    { immo }
  );

  if (SINGLETON_IMMO_TYPES.has(extracted.type) || SINGLETON_FINANCIAL_TYPES.has(extracted.type)) {
    score += 10;
  }

  if (isAmountPrimaryMatch(extracted)) {
    const amountOnly = scoreAmountProximity(
      extracted.montant,
      referenceMontantEuro(existing, extracted.type),
      { immo }
    );
    if (amountOnly >= 45) score += 8;
    else if (amountOnly >= 25) score += 4;
  }

  return score;
}

export function findCompatibleExistingInvestissements(
  extractedType: string,
  existingInvestissements: readonly Investissement[]
): Investissement[] {
  return existingInvestissements.filter((inv) =>
    typesAreCompatible(extractedType, inv.type_produit)
  );
}

export function findBestRioInvestissementMatch(
  extracted: RioExtractedInvestissement,
  availableInvestissements: readonly Investissement[],
  context?: RioMatchContext
): Investissement | undefined {
  const compatible = availableInvestissements.filter((inv) =>
    typesAreCompatible(extracted.type, inv.type_produit)
  );
  if (compatible.length === 0) return undefined;

  const minScore = minScoreForMatch(extracted);
  let best: Investissement | undefined;
  let bestScore = 0;

  for (const existing of compatible) {
    const score = scoreRioInvestissementMatch(extracted, existing, context);
    if (score > bestScore) {
      bestScore = score;
      best = existing;
    }
  }

  if (!best || bestScore < minScore) return undefined;

  const expectedPartner = expectedPartenaireForRioLabel(extracted.label);
  const crmPartner = partenaireNomFor(best, context);
  if (expectedPartner && crmPartner && !partenaireKeysMatch(expectedPartner, crmPartner)) {
    return undefined;
  }

  const partnerScore = scoreRioPartenaireProductMatch(
    extracted.label,
    best.nom_produit,
    partenaireNomFor(best, context)
  );

  const immo = isImmoProductType(extracted.type);
  const nameScore = scoreLabelSimilarity(
    extracted.type,
    extracted.label,
    best.type_produit,
    best.nom_produit
  );
  const amountScore = scoreAmountProximity(
    extracted.montant,
    referenceMontantEuro(best, extracted.type),
    { immo }
  );

  // Produit Stellium connu : pas de rapprochement sur le seul montant (nom générique + sans partenaire).
  if (expectedPartner && partnerScore < 55 && nameScore < 55) {
    return undefined;
  }

  if (!isAmountPrimaryMatch(extracted) && partnerScore < 55) {
    if (nameScore < 20 && amountScore < 25) {
      return undefined;
    }
  }

  return best;
}

function matchSpecificity(extracted: RioExtractedInvestissement): number {
  let score = normalizeInvestmentLabel(extracted.label).length;
  if (GENERIC_EPARGNE_TYPES.has(extracted.type)) score -= 40;
  if (isGenericImmoLabel(extracted.type, extracted.label)) score -= 35;
  if (extracted.type === "ASSURANCE_VIE" || extracted.type === "SCPI") score += 15;
  if (isImmoProductType(extracted.type) && !isGenericImmoLabel(extracted.type, extracted.label)) {
    score += 10;
  }
  return score;
}

export function buildRioMatchContext(
  partenaires: readonly Partenaire[]
): RioMatchContext {
  return {
    partenaireNomById: new Map(partenaires.map((p) => [p.id, p.raison_sociale])),
  };
}

/** Rapprochement 1:1 extrait RIO → investissements CRM (ordre : lignes les plus spécifiques d'abord). */
export function matchRioExtractedInvestissements(
  extractedItems: readonly RioExtractedInvestissement[],
  existingInvestissements: readonly Investissement[],
  context?: RioMatchContext
): Map<string, Investissement | null> {
  const sorted = [...extractedItems].sort(
    (a, b) => matchSpecificity(b) - matchSpecificity(a)
  );
  const usedExistingIds = new Set<number>();
  const result = new Map<string, Investissement | null>();

  for (const extracted of sorted) {
    const available = existingInvestissements.filter((inv) => !usedExistingIds.has(inv.id));
    const match = findBestRioInvestissementMatch(extracted, available, context);
    result.set(extracted.id, match ?? null);
    if (match) usedExistingIds.add(match.id);
  }

  for (const extracted of extractedItems) {
    if (!result.has(extracted.id)) {
      result.set(extracted.id, null);
    }
  }

  return result;
}
