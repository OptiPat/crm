import { isInvestissementActifEncours } from "@/lib/investissements/investissement-statut";

/** SCPI en pleine propriété (hors démembrement / fiscale). */
export const SCPI_PLEINE_PROPRIETE_TYPES = ["SCPI"] as const;

export type ScpiPleineProprieteType = (typeof SCPI_PLEINE_PROPRIETE_TYPES)[number];

type ScpiReinvestFields = {
  id?: number;
  origine?: string;
  statut?: string;
  type_produit?: string;
  reinvestissement_dividendes?: boolean;
  date_fin_pret?: number | null;
  mensualite_credit?: number | null;
  credit_crd?: number | null;
};

export type ScpiCreditFields = Pick<
  ScpiReinvestFields,
  "date_fin_pret" | "mensualite_credit" | "credit_crd"
>;

/** SCPI pouvant porter un crédit (fin de prêt, mensualité, CRD). */
export const SCPI_CREDIT_TYPES = ["SCPI", "SCPI_FISCALE", "SCPI_DEMEMBREMENT"] as const;

export function isScpiCreditEligibleType(typeProduit: string | undefined): boolean {
  if (!typeProduit) return false;
  return (SCPI_CREDIT_TYPES as readonly string[]).includes(typeProduit);
}

export function hasScpiCredit(inv: ScpiCreditFields): boolean {
  if (inv.date_fin_pret != null && inv.date_fin_pret > 0) return true;
  if (inv.mensualite_credit != null && inv.mensualite_credit > 0) return true;
  if (inv.credit_crd != null && inv.credit_crd > 0) return true;
  return false;
}

export function formatScpiCreditLabel(
  inv: ScpiCreditFields,
  formatEuro: (centimes?: number) => string,
  formatDate: (timestamp?: number) => string
): string | null {
  if (!hasScpiCredit(inv)) return null;
  const parts = ["Crédit"];
  if (inv.credit_crd != null && inv.credit_crd > 0) {
    parts.push(`CRD ${formatEuro(inv.credit_crd)}`);
  } else if (inv.mensualite_credit != null && inv.mensualite_credit > 0) {
    parts.push(`${formatEuro(inv.mensualite_credit)}/mois`);
  }
  if (inv.date_fin_pret) {
    parts.push(`fin ${formatDate(inv.date_fin_pret)}`);
  }
  return parts.join(" · ");
}

export function isScpiPleineProprieteType(typeProduit: string | undefined): boolean {
  if (!typeProduit) return false;
  return (SCPI_PLEINE_PROPRIETE_TYPES as readonly string[]).includes(typeProduit);
}

export function hasActiveReinvestissementDividendes(
  inv: Pick<ScpiReinvestFields, "reinvestissement_dividendes">
): boolean {
  return Boolean(inv.reinvestissement_dividendes);
}

export function isScpiPleineProprieteAvecMoi(inv: ScpiReinvestFields): boolean {
  return inv.origine === "MON_CONSEIL" && isScpiPleineProprieteType(inv.type_produit);
}

export interface ScpiReinvestissementCoverageStats {
  total: number;
  withReinvest: number;
  withoutReinvest: number;
  withCredit: number;
  /** 0–100, null si aucune SCPI pleine propriété avec moi. */
  percentWithReinvest: number | null;
}

export function computeScpiReinvestissementCoverageStats(
  investissements: ScpiReinvestFields[],
  options?: { avecMoiOnly?: boolean }
): ScpiReinvestissementCoverageStats {
  const avecMoiOnly = options?.avecMoiOnly !== false;
  const seenIds = new Set<number>();
  let total = 0;
  let withReinvest = 0;
  let withCredit = 0;

  for (const inv of investissements) {
    if (inv.id != null) {
      if (seenIds.has(inv.id)) continue;
      seenIds.add(inv.id);
    }
    if (avecMoiOnly && inv.origine !== "MON_CONSEIL") continue;
    if (!isInvestissementActifEncours(inv)) continue;
    if (!isScpiPleineProprieteType(inv.type_produit)) continue;
    total += 1;
    if (hasActiveReinvestissementDividendes(inv)) withReinvest += 1;
    if (hasScpiCredit(inv)) withCredit += 1;
  }

  const withoutReinvest = total - withReinvest;
  return {
    total,
    withReinvest,
    withoutReinvest,
    withCredit,
    percentWithReinvest: total > 0 ? (withReinvest / total) * 100 : null,
  };
}

export function filterScpiSansReinvestissementDividendes<T extends ScpiReinvestFields>(
  investissements: T[]
): T[] {
  return investissements.filter(
    (inv) =>
      isInvestissementActifEncours(inv) &&
      isScpiPleineProprieteAvecMoi(inv) &&
      !hasActiveReinvestissementDividendes(inv)
  );
}

/** Crédits SCPI en tête de liste (filtre réinv. actif). */
export function compareInvestissementsScpiCreditFirst(
  a: ScpiCreditFields,
  b: ScpiCreditFields
): number {
  const aCredit = hasScpiCredit(a) ? 0 : 1;
  const bCredit = hasScpiCredit(b) ? 0 : 1;
  return aCredit - bCredit;
}
