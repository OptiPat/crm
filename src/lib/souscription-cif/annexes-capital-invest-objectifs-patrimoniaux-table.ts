import type { AnnexesScpiObjectifsPatrimoniauxRow } from "@/lib/souscription-cif/annexes-scpi-objectifs-patrimoniaux-table";

/** Capital investissement — Placements financiers cochés, Immobilier décoché. */
export const ANNEXES_CAPITAL_INVEST_OBJECTIFS_PATRIMONIAUX_ROWS: ReadonlyArray<AnnexesScpiObjectifsPatrimoniauxRow> =
  [
    {
      label: "Investir à moyen ou long terme",
      immobilier: false,
      placementsFinanciers: true,
    },
    {
      label: "Création, diversification et développement",
      immobilier: false,
      placementsFinanciers: true,
    },
    {
      label: "Création et développement d'épargne",
      immobilier: false,
      placementsFinanciers: true,
    },
    {
      label: "Préparation, amélioration de la retraite",
      immobilier: false,
      placementsFinanciers: true,
    },
  ];

/** Cases objectifs CI : ⬜ / ☒ (aligné caractéristiques opération). */
export const ANNEXES_CAPITAL_INVEST_OBJECTIFS_CHECKED = "☒";
export const ANNEXES_CAPITAL_INVEST_OBJECTIFS_UNCHECKED = "⬜";

export function formatCapitalInvestObjectifPatrimonialCheck(checked: boolean): string {
  return checked
    ? ANNEXES_CAPITAL_INVEST_OBJECTIFS_CHECKED
    : ANNEXES_CAPITAL_INVEST_OBJECTIFS_UNCHECKED;
}
