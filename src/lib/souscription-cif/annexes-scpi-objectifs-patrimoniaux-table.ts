/** Tableau objectifs patrimoniaux — annexes SCPI page 6. */

export type AnnexesScpiObjectifsPatrimoniauxRow = {
  label: string;
  immobilier: boolean;
  placementsFinanciers: boolean;
};

export const ANNEXES_SCPI_OBJECTIFS_CHECKED = "☒";
export const ANNEXES_SCPI_OBJECTIFS_UNCHECKED = "☐";

/** Lignes type SCPI de rendement — cases cochées Immobilier + Placements financiers. */
export const ANNEXES_SCPI_OBJECTIFS_PATRIMONIAUX_ROWS: ReadonlyArray<AnnexesScpiObjectifsPatrimoniauxRow> =
  [
    {
      label: "Investir à moyen ou long terme",
      immobilier: true,
      placementsFinanciers: true,
    },
    {
      label: "Création, diversification et développement",
      immobilier: true,
      placementsFinanciers: true,
    },
    {
      label: "Création et développement d'épargne",
      immobilier: true,
      placementsFinanciers: true,
    },
    {
      label: "Préparation, amélioration de la retraite",
      immobilier: true,
      placementsFinanciers: true,
    },
  ];

export function formatObjectifPatrimonialCheck(checked: boolean): string {
  return checked ? ANNEXES_SCPI_OBJECTIFS_CHECKED : ANNEXES_SCPI_OBJECTIFS_UNCHECKED;
}
