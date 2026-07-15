import { isImmobilierFinancingType } from "@/lib/investissements/investissement-immo-financing";

const AV_PER_TYPES = new Set([
  "ASSURANCE_VIE",
  "PER",
  "CONTRAT_CAPITALISATION",
  "PREVOYANCE",
  "EPARGNE_SALARIALE",
]);

const SCPI_CAPITAL_TYPES = new Set([
  "SCPI",
  "SCPI_FISCALE",
  "SCPI_DEMEMBREMENT",
  "FIP_FCPI",
  "FCPR",
  "FPCI",
  "FPCR",
]);

export type RemunerationPvKind = "auto" | "immo_manual" | "unknown";

export function remunerationPvKindForTypeProduit(typeProduit: string): RemunerationPvKind {
  const t = typeProduit.trim().toUpperCase();
  if (!t) return "unknown";
  if (t === "G3F") return "auto";
  if (AV_PER_TYPES.has(t) || SCPI_CAPITAL_TYPES.has(t)) return "auto";
  if (isImmobilierFinancingType(t) || t === "IMMOBILIER") return "immo_manual";
  return "unknown";
}

/** PV automatique (hors immo). Retourne `null` si saisie manuelle requise. */
export function defaultPvForTypeProduit(
  typeProduit: string,
  options?: { cifEnabled?: boolean }
): number | null {
  const t = typeProduit.trim().toUpperCase();
  if (!t) return null;
  if (t === "G3F") return 0.27;
  if (AV_PER_TYPES.has(t)) return 0.4;
  if (SCPI_CAPITAL_TYPES.has(t)) return options?.cifEnabled ? 0.5 : 0.4;
  if (remunerationPvKindForTypeProduit(t) === "immo_manual") return null;
  return null;
}

export function effectivePvForRemuneration(options: {
  typeProduit: string;
  cifEnabled: boolean;
  pvManual?: number | null;
}): number | null {
  const manual = options.pvManual;
  if (manual != null && Number.isFinite(manual) && manual > 0) {
    return manual;
  }
  return defaultPvForTypeProduit(options.typeProduit, { cifEnabled: options.cifEnabled });
}
