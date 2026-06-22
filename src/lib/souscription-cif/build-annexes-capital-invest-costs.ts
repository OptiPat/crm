import { ANNEXES_CAPITAL_INVEST_COSTS_ROWS } from "@/lib/souscription-cif/annexes-capital-invest-costs-table";
import type { AnnexesScpiCostsRow } from "@/lib/souscription-cif/annexes-scpi-costs-table";
import {
  formatEuroAmountCif,
  formatPercentCif,
  parseEuroInput,
} from "@/lib/souscription-cif/build-annexes-scpi-costs";
import { sumMontantCapitalInvestFromSouscriptions } from "@/lib/souscription-cif/capital-invest-annexe-souscriptions";
import {
  computeCapitalInvestProductCostsPercentRatio,
  sumCapitalInvestProductCostsFromSouscriptions,
} from "@/lib/souscription-cif/capital-invest-emt-product-costs";
import type { SouscriptionDossierFields } from "@/lib/souscription-cif/dossier-fields";

const ROW_CIF_TIERS_LABEL =
  "Paiement reçu de tiers par le CIF\nAu cumul de tous les Fonds";
const ROW_PRODUCTS_LABEL = "Coûts liés aux produits";
const ROW_TOTAL_LABEL = "TOTAL COÛTS ET FRAIS";

function formatAmountAndPercentFromRatio(
  amountEur: number | null,
  percentRatio: number | null
): { amount: string; percent: string } {
  if (amountEur == null) return { amount: "", percent: "" };
  const amount = formatEuroAmountCif(amountEur);
  if (percentRatio == null) return { amount, percent: "" };
  return { amount, percent: formatPercentCif(percentRatio) };
}

export function buildAnnexesCapitalInvestCostsRows(
  dossier: SouscriptionDossierFields
): ReadonlyArray<AnnexesScpiCostsRow> {
  const souscriptions = dossier.capitalInvestAnnexeSouscriptions;
  const quotePart = parseEuroInput(dossier.quotePartPercueConsultantCifEur);
  const montantSouscrit = sumMontantCapitalInvestFromSouscriptions(souscriptions);
  const productCosts = sumCapitalInvestProductCostsFromSouscriptions(souscriptions);
  const productPercentRatio = computeCapitalInvestProductCostsPercentRatio(souscriptions);

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

  return ANNEXES_CAPITAL_INVEST_COSTS_ROWS.map((row) => {
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
