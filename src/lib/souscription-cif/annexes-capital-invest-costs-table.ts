/** Tableau coûts et frais — annexes Capital investissement (après tableau récap). */

export const ANNEXES_CAPITAL_INVEST_COSTS_INTRO =
  "[u]Informations sur les coûts et les frais :[/u]\nDisponibles sur le Document d'Informations Clés.";

export const ANNEXES_CAPITAL_INVEST_COSTS_FOOTER =
  "Le client peut obtenir sur demande une ventilation plus précise.";

export type AnnexesCapitalInvestCostsRow = {
  label: string;
  amount: string;
  percent: string;
  isTotal?: boolean;
};

export const ANNEXES_CAPITAL_INVEST_COSTS_ROWS: ReadonlyArray<AnnexesCapitalInvestCostsRow> = [
  {
    label: "Coûts liés aux services",
    amount: "0 €",
    percent: "0 %",
  },
  {
    label: "Paiement reçu de tiers par le CIF\nAu cumul de tous les Fonds",
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
