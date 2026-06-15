import {
  ANNEXES_SCPI_COSTS_ROWS,
  type AnnexesScpiCostsRow,
} from "@/lib/souscription-cif/annexes-scpi-costs-table";
import {
  sumMontantSouscritFromSouscriptions,
} from "@/lib/souscription-cif/scpi-annexe-souscriptions";
import { sumProductCostsFromSouscriptions, computeProductCostsPercentRatio } from "@/lib/souscription-cif/scpi-emt-product-costs";
import type { SouscriptionDossierFields } from "@/lib/souscription-cif/dossier-fields";

const ROW_CIF_TIERS_LABEL =
  "Paiement reçu de tiers par le CIF\nAu cumul de toutes les SCPI";
const ROW_PRODUCTS_LABEL = "Coûts liés aux produits";
const ROW_TOTAL_LABEL = "TOTAL COÛTS ET FRAIS";

/** Parse un montant saisi (ex. « 1 200,50 », « 1200.50 »). */
export function parseEuroInput(value: string): number | null {
  const trimmed = value
    .trim()
    .replace(/\u00a0|\u202f/g, " ")
    .replace(/\s/g, "")
    .replace(/,/g, ".")
    .replace(/€/g, "");
  if (!trimmed) return null;
  const n = Number.parseFloat(trimmed);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Extrait le montant souscrit depuis « Mes préconisations ». */
export function parseMontantSouscritFromMesPreconisations(text: string): number | null {
  const patterns = [
    /investissement global de\s+([\d\s\u00a0\u202f]+)(?:[,.]\d+)?\s*€/i,
    /montant total souscrit de\s+([\d\s\u00a0\u202f]+)(?:[,.]\d+)?\s*€/i,
    /pour un montant de\s+([\d\s\u00a0\u202f]+)(?:[,.]\d+)?\s*€/i,
  ];
  for (const re of patterns) {
    const match = text.match(re);
    if (match) {
      const parsed = parseEuroInput(match[1]);
      if (parsed != null) return parsed;
    }
  }
  return null;
}

/** @deprecated Alias — préférer parseMontantSouscritFromMesPreconisations */
export const parseMontantInvestiFromMesPreconisations = parseMontantSouscritFromMesPreconisations;

export function formatEuroAmountCif(euros: number): string {
  return `${new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(euros)} €`;
}

export function formatPercentCif(ratio: number): string {
  const pct = ratio * 100;
  return `${new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  }).format(pct)} %`;
}

/** % = quote-part perçue consultant (CIF) / montant souscrit */
export function computeQuotePartCifPercent(
  quotePartEur: number,
  montantSouscritEur: number
): number | null {
  if (montantSouscritEur <= 0) return null;
  return quotePartEur / montantSouscritEur;
}

function formatAmountAndPercentFromRatio(
  amountEur: number | null,
  percentRatio: number | null
): { amount: string; percent: string } {
  if (amountEur == null) return { amount: "", percent: "" };
  const amount = formatEuroAmountCif(amountEur);
  if (percentRatio == null) return { amount, percent: "" };
  return { amount, percent: formatPercentCif(percentRatio) };
}

export function buildAnnexesScpiCostsRows(
  dossier: SouscriptionDossierFields
): ReadonlyArray<AnnexesScpiCostsRow> {
  const quotePart = parseEuroInput(dossier.quotePartPercueConsultantCifEur);
  const montantSouscrit = sumMontantSouscritFromSouscriptions(dossier.scpiAnnexeSouscriptions);
  const productCosts = sumProductCostsFromSouscriptions(dossier.scpiAnnexeSouscriptions);
  const productPercentRatio = computeProductCostsPercentRatio(dossier.scpiAnnexeSouscriptions);

  const servicesEur = 0;
  const tiersEur = quotePart ?? null;
  const tiersPercentRatio =
    tiersEur != null && montantSouscrit != null && montantSouscrit > 0
      ? tiersEur / montantSouscrit
      : null;

  const totalEur =
    tiersEur != null || productCosts != null
      ? servicesEur + (tiersEur ?? 0) + (productCosts ?? 0)
      : null;

  const totalPercentRatio =
    totalEur != null && montantSouscrit != null && montantSouscrit > 0
      ? totalEur / montantSouscrit
      : null;

  const productsFormatted = formatAmountAndPercentFromRatio(productCosts, productPercentRatio);
  const tiersFormatted = formatAmountAndPercentFromRatio(tiersEur, tiersPercentRatio);
  const totalFormatted = formatAmountAndPercentFromRatio(totalEur, totalPercentRatio);

  return ANNEXES_SCPI_COSTS_ROWS.map((row) => {
    if (row.label === ROW_CIF_TIERS_LABEL) {
      return { ...row, amount: tiersFormatted.amount, percent: tiersFormatted.percent };
    }
    if (row.label === ROW_PRODUCTS_LABEL) {
      return { ...row, amount: productsFormatted.amount, percent: productsFormatted.percent };
    }
    if (row.label === ROW_TOTAL_LABEL) {
      return { ...row, amount: totalFormatted.amount, percent: totalFormatted.percent };
    }
    return row;
  });
}
