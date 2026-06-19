import { IMMOBILIER_TYPES } from "@/lib/investissements/investissement-display";

/** Types patrimoine immobilier éligibles aux champs crédit / loyer structurés. */
export function isImmobilierFinancingType(typeProduit: string | undefined): boolean {
  if (!typeProduit) return false;
  return IMMOBILIER_TYPES.includes(typeProduit as (typeof IMMOBILIER_TYPES)[number]);
}

export const SCPI_FINANCING_TYPES = ["SCPI", "SCPI_FISCALE", "SCPI_DEMEMBREMENT"] as const;

export function isScpiFinancingType(typeProduit: string | undefined): boolean {
  if (!typeProduit) return false;
  return (SCPI_FINANCING_TYPES as readonly string[]).includes(typeProduit);
}

export function acceptsInvestissementFinancingFields(typeProduit: string): boolean {
  return isImmobilierFinancingType(typeProduit) || isScpiFinancingType(typeProduit);
}

export function euroToFinancingCentimes(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = parseFloat(trimmed.replace(",", "."));
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.round(parsed * 100);
}

export function financingCentimesToEuro(value?: number | null): string {
  if (value == null || value <= 0) return "";
  return String(value / 100);
}
