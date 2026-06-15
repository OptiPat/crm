/** Tableau instruments — article 5 (SCPI rendement, SCPI fiscales, capital invest., G3F…). */

export type ScpiLmInstrumentsTableRow = {
  product: string;
  riskScale: string;
  warnings: string;
  fees: string;
  paymentMode: string;
  sustainability: string;
};

export const SCPI_LM_INSTRUMENTS_TABLE_HEADERS = [
  "",
  "Risques\nSur une échelle de 1 à 7",
  "Mises en garde",
  "Niveaux de frais",
  "Mode de règlement",
  "Critères de durabilité pris en compte *",
] as const;

export const SCPI_LM_INSTRUMENTS_TABLE_ROWS: ScpiLmInstrumentsTableRow[] = [
  {
    product: "SCPI de Rendement",
    riskScale: "En moyenne 3",
    warnings: `Risque en capital
Risque de liquidité
Risque de variation des revenus
Risque immobilier`,
    fees: `Frais d'entrée entre 8,5 % et 12 %

Frais de gestion entre 10 % et 12 % des produits locatifs HT et des produits financiers nets encaissés.`,
    paymentMode:
      "Rétrocession de commissions sur une quote-part des droits d'entrée comprises entre 3 et 4 %",
    sustainability: `- Règlement Taxonomie
- Règlement SFDR
- PAI`,
  },
  {
    product: "SCPI fiscales",
    riskScale: "Entre 3 et 6 (selon le dispositif fiscal associé)",
    warnings: `Risque en capital
Risque de liquidité
Risque immobilier
Risque de variation des revenus
Risque fiscal`,
    fees: `Frais d'entrée entre 8,5 % et 12 %

Frais de gestion entre 10 % et 12 % des produits locatifs HT et des produits financiers nets encaissés.`,
    paymentMode:
      "Rétrocession de commissions sur une quote-part des droits d'entrée comprises entre 3 et 4 %",
    sustainability: `- Règlement Taxonomie
- Règlement SFDR
- PAI`,
  },
  {
    product: "Capital Investissement",
    riskScale: "6 ou 7",
    warnings: `Risque en capital
Risque de liquidité
Risque lié à l'investissement dans des petites capitalisations sur des marchés non réglementés
Risque lié aux obligations convertibles
Risque fiscal
Risque lié à l'estimation de la valeur des titres en portefeuille`,
    fees: `Frais d'entrée entre 4 et 5 %

Frais de gestion entre 2,5 % et 4 %`,
    paymentMode:
      "Rétrocession de commissions sur une quote-part des droits d'entrée comprises entre 3 et 4 %",
    sustainability: "Aucun critère",
  },
  {
    product: "GIRARDIN INDUSTRIEL",
    riskScale: "6 ou 7",
    warnings: `Risque en capital
Risque de liquidité
Risque fiscal
Risque locatif`,
    fees: "Frais d'enregistrement : environ 150€",
    paymentMode: "Commission d'apporteur d'affaires : 0,27 %",
    sustainability: "Aucun critère",
  },
];
