import {
  ANNEXES_SCPI_COSTS_ROWS,
  type AnnexesScpiCostsRow,
} from "@/lib/souscription-cif/annexes-scpi-costs-table";
import type { SouscriptionDossierFields } from "@/lib/souscription-cif/dossier-fields";

const ROW_CIF_TIERS_LABEL =
  "Paiement reçu de tiers par le CIF\nAu cumul de toutes les SCPI";

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

export function buildAnnexesScpiCostsRows(
  dossier: SouscriptionDossierFields
): ReadonlyArray<AnnexesScpiCostsRow> {
  const quotePart = parseEuroInput(dossier.quotePartPercueConsultantCifEur);
  const montantSouscrit = parseMontantSouscritFromMesPreconisations(dossier.mesPreconisations);

  let tiersAmount = "";
  let tiersPercent = "";
  if (quotePart != null) {
    tiersAmount = formatEuroAmountCif(quotePart);
  }
  if (quotePart != null && montantSouscrit != null) {
    const ratio = computeQuotePartCifPercent(quotePart, montantSouscrit);
    if (ratio != null) {
      tiersPercent = formatPercentCif(ratio);
    }
  }

  return ANNEXES_SCPI_COSTS_ROWS.map((row) => {
    if (row.label !== ROW_CIF_TIERS_LABEL) return row;
    return { ...row, amount: tiersAmount, percent: tiersPercent };
  });
}
