import type { AnnexesScpiObjectifsPatrimoniauxRow } from "@/lib/souscription-cif/annexes-scpi-objectifs-patrimoniaux-table";

/** Girardin industriel — cases ⬜ / ☒ (aligné Capital invest). */
export const ANNEXES_G3F_OBJECTIFS_PATRIMONIAUX_ROWS: ReadonlyArray<AnnexesScpiObjectifsPatrimoniauxRow> =
  [
    {
      label: "Investir à moyen ou long terme",
      immobilier: false,
      placementsFinanciers: true,
    },
    {
      label: "Création, diversification et développement",
      immobilier: false,
      placementsFinanciers: false,
    },
    {
      label: "Création et développement d'épargne",
      immobilier: false,
      placementsFinanciers: false,
    },
    {
      label: "Préparation, amélioration de la retraite",
      immobilier: false,
      placementsFinanciers: false,
    },
    {
      label: "Optimisation fiscale / Réduction d'impôt",
      immobilier: false,
      placementsFinanciers: true,
    },
  ];
