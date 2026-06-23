import type { AnnexesScpiCaracteristiquesSection } from "@/lib/souscription-cif/annexes-scpi-caracteristiques-operation-table";

/** Girardin industriel — caractéristiques de l'opération (§ 3 annexes). */
export const ANNEXES_G3F_CARACTERISTIQUES_OPERATION_SECTIONS: ReadonlyArray<AnnexesScpiCaracteristiquesSection> =
  [
    {
      title: "Avantages",
      rows: [
        {
          label: "Capitalisation",
          immobilier: { kind: "check", checked: false },
          placementsFinanciers: { kind: "check", checked: false },
        },
        {
          label: "Performances sur le long terme",
          immobilier: { kind: "check", checked: false },
          placementsFinanciers: { kind: "check", checked: false },
        },
        {
          label: "Possibilité de plus-values",
          immobilier: { kind: "check", checked: false },
          placementsFinanciers: { kind: "check", checked: false },
        },
        {
          label: "Économies fiscales",
          immobilier: { kind: "check", checked: false },
          placementsFinanciers: { kind: "check", checked: true },
        },
        {
          label: "Développement d'épargne",
          immobilier: { kind: "check", checked: false },
          placementsFinanciers: { kind: "check", checked: false },
        },
        {
          label: "Complément de revenu à la retraite",
          immobilier: { kind: "check", checked: false },
          placementsFinanciers: { kind: "check", checked: false },
        },
        {
          label: "Accompagnement et conseil",
          immobilier: { kind: "check", checked: false },
          placementsFinanciers: { kind: "check", checked: true },
        },
      ],
    },
    {
      title: "Inconvénients",
      rows: [
        {
          label: "Fluctuations boursières",
          immobilier: { kind: "empty" },
          placementsFinanciers: {
            kind: "text",
            value: "Voir détail en annexe",
            rowSpan: 3,
          },
        },
        {
          label: "Risques locatifs",
          immobilier: { kind: "empty" },
          placementsFinanciers: { kind: "span-continue" },
        },
        {
          label: "Respect rigoureux du cadre fiscal",
          immobilier: { kind: "empty" },
          placementsFinanciers: { kind: "span-continue" },
        },
        {
          label: "Fiscalité et plus-values",
          immobilier: { kind: "check", checked: false },
          placementsFinanciers: { kind: "check", checked: false },
        },
      ],
    },
  ];
