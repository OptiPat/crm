/** Tableau caractéristiques de l'opération — annexes SCPI page 6 § 3. */

export type AnnexesScpiCaracteristiquesCell =
  | { kind: "check"; checked: boolean }
  | { kind: "text"; value: string; rowSpan?: number }
  | { kind: "empty" }
  /** Cellule couverte par un rowSpan au-dessus — pas de cellule rendue. */
  | { kind: "span-continue" };

export type AnnexesScpiCaracteristiquesRow = {
  label: string;
  immobilier: AnnexesScpiCaracteristiquesCell;
  placementsFinanciers: AnnexesScpiCaracteristiquesCell;
};

export type AnnexesScpiCaracteristiquesSection = {
  title: "Avantages" | "Inconvénients";
  rows: ReadonlyArray<AnnexesScpiCaracteristiquesRow>;
};

export const ANNEXES_SCPI_CARACTERISTIQUES_CHECKED = "☒";
export const ANNEXES_SCPI_CARACTERISTIQUES_UNCHECKED = "⬜";

export const ANNEXES_SCPI_CARACTERISTIQUES_OPERATION_SECTIONS: ReadonlyArray<AnnexesScpiCaracteristiquesSection> =
  [
    {
      title: "Avantages",
      rows: [
        {
          label: "Capitalisation",
          immobilier: { kind: "check", checked: true },
          placementsFinanciers: { kind: "check", checked: true },
        },
        {
          label: "Performances sur le long terme",
          immobilier: { kind: "check", checked: true },
          placementsFinanciers: { kind: "check", checked: true },
        },
        {
          label: "Possibilité de plus-values",
          immobilier: { kind: "check", checked: true },
          placementsFinanciers: { kind: "check", checked: true },
        },
        {
          label: "Économies fiscales",
          immobilier: { kind: "check", checked: false },
          placementsFinanciers: { kind: "check", checked: false },
        },
        {
          label: "Développement d'épargne",
          immobilier: { kind: "check", checked: true },
          placementsFinanciers: { kind: "check", checked: true },
        },
        {
          label: "Complément de revenu à la retraite",
          immobilier: { kind: "check", checked: true },
          placementsFinanciers: { kind: "check", checked: true },
        },
        {
          label: "Accompagnement et conseil",
          immobilier: { kind: "check", checked: true },
          placementsFinanciers: { kind: "check", checked: true },
        },
      ],
    },
    {
      title: "Inconvénients",
      rows: [
        {
          label: "Fluctuations boursières",
          immobilier: { kind: "text", value: "Voir détail en annexe", rowSpan: 3 },
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
          immobilier: { kind: "check", checked: true },
          placementsFinanciers: { kind: "check", checked: true },
        },
      ],
    },
  ];

export function formatCaracteristiqueOperationCell(cell: AnnexesScpiCaracteristiquesCell): string {
  switch (cell.kind) {
    case "check":
      return cell.checked
        ? ANNEXES_SCPI_CARACTERISTIQUES_CHECKED
        : ANNEXES_SCPI_CARACTERISTIQUES_UNCHECKED;
    case "text":
      return cell.value;
    case "empty":
      return "\u00a0";
    case "span-continue":
      return "";
  }
}