/**
 * Tableau comparatif fiscalité FCPI JEI / FIP Outre-Mer (annexes Capital investissement § 3.1).
 * La colonne `fcpi` porte le FCPI JEI (CGI art. 199 terdecies-0 A bis) : depuis le 21/02/2026,
 * seuls les FCPI investis en JEI ouvrent droit à réduction (LF 2026).
 */

export type CapitalInvestFiscaliteTableRow =
  | {
      kind: "data";
      label: string;
      fcpi: string;
      fipOm: string;
      /** Fond léger sur la colonne FCPI JEI (plafond de réduction). */
      highlightFcpi?: boolean;
      /** Fond léger sur la colonne FIP OM (plafond de réduction). */
      highlightFipOm?: boolean;
    }
  | {
      /** Ligne à cases cochées (plafonds, IFI…). */
      kind: "niche";
      label: string;
      fcpi: boolean;
      fipOm: boolean;
    };

export const CAPITAL_INVEST_FISCALITE_FCPI_HEADER = "FCPI JEI";
export const CAPITAL_INVEST_FISCALITE_FIP_OM_HEADER = "FIP OUTRE-MER";

export const CAPITAL_INVEST_FISCALITE_TABLE_ROWS: ReadonlyArray<CapitalInvestFiscaliteTableRow> = [
  {
    kind: "data",
    label: "Taux de réduction d'IR (max., × quota éligible)",
    fcpi: "30 %",
    fipOm: "30 %",
  },
  {
    kind: "data",
    label: "Versement maximum — célibataire",
    fcpi: "75 000 €",
    fipOm: "12 000 €",
  },
  {
    kind: "data",
    label: "Versement maximum — couple",
    fcpi: "150 000 €",
    fipOm: "24 000 €",
  },
  {
    kind: "data",
    label: "Plafond de réduction — célibataire",
    fcpi: "22 500 €",
    fipOm: "3 600 €",
    highlightFcpi: true,
    highlightFipOm: true,
  },
  {
    kind: "data",
    label: "Plafond de réduction — couple",
    fcpi: "45 000 €",
    fipOm: "7 200 €",
    highlightFcpi: true,
    highlightFipOm: true,
  },
  {
    kind: "niche",
    label: "Plafond niches fiscales 10 000 €",
    fcpi: false,
    fipOm: true,
  },
  {
    kind: "niche",
    label: "Plafond spécifique JEI 50 000 € (2024–2028)",
    fcpi: true,
    fipOm: false,
  },
  {
    kind: "data",
    label: "Conservation des parts",
    fcpi: "Jusqu'au 31/12 de N+5",
    fipOm: "Jusqu'au 31/12 de N+5",
  },
  {
    kind: "data",
    label: "Produits et plus-values à la sortie",
    fcpi: "Flat-tax",
    fipOm: "0 % d'IR (prélèvements sociaux uniquement)",
  },
  {
    kind: "niche",
    label: "Non imposable à l'IFI",
    fcpi: true,
    fipOm: true,
  },
];

export function formatCapitalInvestFiscaliteCheck(checked: boolean): string {
  return checked ? "✓" : "Non";
}
