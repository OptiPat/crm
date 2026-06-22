/** Tableau comparatif fiscalité FCPI / FIP Outre-Mer (annexes Capital investissement § 3.1). */

export type CapitalInvestFiscaliteTableRow =
  | {
      kind: "data";
      label: string;
      fcpi: string;
      fipOm: string;
      /** Fond léger sur la colonne FCPI (plafond de réduction). */
      highlightFcpi?: boolean;
      /** Fond léger sur la colonne FIP OM (plafond de réduction). */
      highlightFipOm?: boolean;
    }
  | {
      kind: "niche";
      label: string;
      fcpi: boolean;
      fipOm: boolean;
    };

export const CAPITAL_INVEST_FISCALITE_TABLE_ROWS: ReadonlyArray<CapitalInvestFiscaliteTableRow> = [
  { kind: "data", label: "Réduction d'IR", fcpi: "25 %", fipOm: "30 %" },
  {
    kind: "data",
    label: "Versement maximum — célibataire",
    fcpi: "12 000 €",
    fipOm: "12 000 €",
  },
  {
    kind: "data",
    label: "Versement maximum — couple",
    fcpi: "24 000 €",
    fipOm: "24 000 €",
  },
  {
    kind: "data",
    label: "Plafond de réduction — célibataire",
    fcpi: "3 000 €",
    fipOm: "3 600 €",
    highlightFcpi: true,
    highlightFipOm: true,
  },
  {
    kind: "data",
    label: "Plafond de réduction — couple",
    fcpi: "6 000 €",
    fipOm: "7 200 €",
    highlightFcpi: true,
    highlightFipOm: true,
  },
  {
    kind: "niche",
    label: "Plafond niches fiscales 10 000 €",
    fcpi: true,
    fipOm: true,
  },
];

export function formatCapitalInvestFiscaliteCheck(checked: boolean): string {
  return checked ? "✓" : "";
}
