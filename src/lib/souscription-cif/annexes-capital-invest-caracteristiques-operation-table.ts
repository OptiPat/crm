import type { AnnexesScpiCaracteristiquesSection } from "@/lib/souscription-cif/annexes-scpi-caracteristiques-operation-table";

/** Capital investissement — cases distinctes des SCPI de rendement. */
export const ANNEXES_CAPITAL_INVEST_CARACTERISTIQUES_OPERATION_SECTIONS: ReadonlyArray<AnnexesScpiCaracteristiquesSection> =
  [
    {
      title: "Avantages",
      rows: [
        {
          label: "Capitalisation",
          immobilier: { kind: "check", checked: false },
          placementsFinanciers: { kind: "check", checked: true },
        },
        {
          label: "Performances sur le long terme",
          immobilier: { kind: "check", checked: false },
          placementsFinanciers: { kind: "check", checked: true },
        },
        {
          label: "Possibilité de plus-values",
          immobilier: { kind: "check", checked: false },
          placementsFinanciers: { kind: "check", checked: true },
        },
        {
          label: "Économies fiscales",
          immobilier: { kind: "check", checked: false },
          placementsFinanciers: { kind: "check", checked: true },
        },
        {
          label: "Développement d'épargne",
          immobilier: { kind: "check", checked: false },
          placementsFinanciers: { kind: "check", checked: true },
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
          immobilier: {
            kind: "text",
            value: "Voir détail en annexe",
            rowSpan: 3,
          },
          placementsFinanciers: {
            kind: "text",
            value: "Voir documents des sociétés de gestion\n+ brochure AMF",
            rowSpan: 3,
          },
        },
        {
          label: "Risques locatifs",
          immobilier: { kind: "span-continue" },
          placementsFinanciers: { kind: "span-continue" },
        },
        {
          label: "Respect rigoureux du cadre fiscal",
          immobilier: { kind: "span-continue" },
          placementsFinanciers: { kind: "span-continue" },
        },
        {
          label: "Fiscalité et plus-values",
          immobilier: { kind: "check", checked: false },
          placementsFinanciers: { kind: "check", checked: true },
        },
      ],
    },
  ];
