/** Valeurs de la liste déroulante `choixcontrat` du modèle PDF arbitrage AV. */

import { resolveStelliumAvProductLabelFromCrm } from "@/lib/pdf/arbitrage-fiche-conseil/av-stellium-product-map";

export const ARBITRAGE_AV_CHOIX_CONTRAT_OPTIONS = [
  "Cristalliance Avenir",
  "Cristalliance Evoluvie",
  "Fipavie Neo",
  "Target +",
  "Patrima + (Serenipierre)",
  "Cristalliance Vie First",
  "Fipavie Ingenierie",
  "Cristalliance Opportunités",
  "Fipavie Premium Evolution 2",
  "Cristalliance Vie / Cristalliance Vie 2",
  "Fipavie Premium / Fipavie Premium Evolution",
  "Cristalliance Horizon",
  "Cristalliance Privilège",
  "Fipavie Retraite Garantie",
] as const;

export type ArbitrageAvChoixContrat = (typeof ARBITRAGE_AV_CHOIX_CONTRAT_OPTIONS)[number];

const STELLIUM_AV_TO_PDF_CHOIX: Partial<
  Record<
    ReturnType<typeof resolveStelliumAvProductLabelFromCrm> & string,
    ArbitrageAvChoixContrat
  >
> = {
  "Cristalliance Avenir": "Cristalliance Avenir",
  "Cristalliance Evoluvie": "Cristalliance Evoluvie",
  "Cristalliance Opportunites": "Cristalliance Opportunités",
  "Cristalliance Vie First": "Cristalliance Vie First",
  "Fipavie Ingénierie": "Fipavie Ingenierie",
};

/** Résout le contrat PDF à partir du produit / partenaire CRM. */
export function resolveArbitrageAvChoixContrat(input: {
  nomProduit: string;
  partenaireNom?: string | null;
  numeroContrat?: string | null;
}): { value: ArbitrageAvChoixContrat | null; candidates: ArbitrageAvChoixContrat[] } {
  void input.numeroContrat;
  const stellium = resolveStelliumAvProductLabelFromCrm(input);
  if (!stellium) {
    return { value: null, candidates: [] };
  }
  const pdfValue = STELLIUM_AV_TO_PDF_CHOIX[stellium] ?? null;
  if (!pdfValue) {
    return { value: null, candidates: [] };
  }
  return { value: pdfValue, candidates: [pdfValue] };
}
