/** Tableau coûts et frais — annexes SCPI page 5 (valeurs calculées ultérieurement). */

export const ANNEXES_SCPI_COSTS_INTRO = "[u]Informations sur les coûts et les frais :[/u]";

export const ANNEXES_SCPI_COSTS_FOOTER =
  "Le client peut obtenir sur demande une ventilation plus précise.";

export type AnnexesScpiCostsRow = {
  label: string;
  amount: string;
  percent: string;
  /** Ligne total (libellé en gras). */
  isTotal?: boolean;
};

export const ANNEXES_SCPI_COSTS_ROWS: ReadonlyArray<AnnexesScpiCostsRow> = [
  {
    label: "Coûts liés aux services",
    amount: "0 €",
    percent: "0 %",
  },
  {
    label: "Paiement reçu de tiers par le CIF\nAu cumul de toutes les SCPI",
    amount: "€",
    percent: "%",
  },
  {
    label: "Coûts liés aux produits",
    amount: "",
    percent: "%",
  },
  {
    label: "TOTAL COÛTS ET FRAIS",
    amount: "",
    percent: "",
    isTotal: true,
  },
];
