/** Tableau avantages / inconvénients — SCPI de rendement (§ 4.1). */

export type AnnexesScpiProsConsRow = {
  advantages: string;
  disadvantages: string;
};

export const ANNEXES_SCPI_PROS_CONS_ROWS: ReadonlyArray<AnnexesScpiProsConsRow> = [
  {
    advantages: "Placement souple et accessible même avec de faibles montants.",
    disadvantages: "Aucune garantie en capital ni en rendement.",
  },
  {
    advantages: "Perception de revenus réguliers sans souci de gestion.",
    disadvantages:
      "Placement de long terme soumis aux fluctuations du marché immobilier.",
  },
  {
    advantages:
      "Mutualisation des risques grâce à la diversification (géographique, sectorielle, etc.) et aux nombreux biens intégrés dans les SCPI.",
    disadvantages: "Frais de souscription.",
  },
  {
    advantages:
      "Permet d'accéder au marché de l'immobilier d'entreprise qui offre des rendements supérieurs à ceux de l'habitation.",
    disadvantages: "Faible liquidité des parts.",
  },
  {
    advantages: "Possibilité de bénéficier de l'effet de levier du crédit.",
    disadvantages: "",
  },
  {
    advantages:
      "Transmission du patrimoine facilité car la valeur unitaire des parts est faible.",
    disadvantages: "",
  },
];

export const ANNEXES_SCPI_PAGE2_SECTION4_INTRO = `[u]3. Avantages et inconvénients[/u]

[u]3.1. D'un point de vue économique et juridique[/u]`;

/** Tableau avantages / inconvénients — § 4.2 fiscal. */
export const ANNEXES_SCPI_PROS_CONS_FISCAL_ROWS: ReadonlyArray<AnnexesScpiProsConsRow> = [
  {
    advantages: "Déductibilité des intérêts d'emprunt pour l'acquisition des parts de SCPI.",
    disadvantages:
      "Revenus soumis à l'impôt sur le revenu au barème progressif et aux prélèvements sociaux au taux global de 17,2 % (excepté pour les revenus encaissés hors de France).",
  },
  {
    advantages:
      "Possibilité de bénéficier du régime micro-foncier si détention d'un immeuble loué par ailleurs.",
    disadvantages: "Valeur vénale soumise à l'IFI.",
  },
];
