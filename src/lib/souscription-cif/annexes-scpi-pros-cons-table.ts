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
    advantages: "Perception de revenus potentiels, non garantis, sans souci de gestion.",
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
      "Permet d'accéder au marché de l'immobilier d'entreprise, historiquement plus rémunérateur que l'habitation, sans garantie de rendement.",
    disadvantages: "Faible liquidité des parts.",
  },
  {
    advantages: "Possibilité de bénéficier de l'effet de levier du crédit.",
    disadvantages: "",
  },
  {
    advantages:
      "Transmission du patrimoine facilitée car la valeur unitaire des parts est faible.",
    disadvantages: "",
  },
];

export const ANNEXES_SCPI_SECTION4_INTRO = `[u]4. Avantages et inconvénients[/u]

4.1. D'un point de vue économique et juridique`;

/** @deprecated Utiliser ANNEXES_SCPI_SECTION4_INTRO */
export const ANNEXES_SCPI_PAGE2_SECTION4_INTRO = ANNEXES_SCPI_SECTION4_INTRO;

/** Tableau avantages / inconvénients — § 4.2 fiscal. */
export const ANNEXES_SCPI_PROS_CONS_FISCAL_ROWS: ReadonlyArray<AnnexesScpiProsConsRow> = [
  {
    advantages: "Déductibilité des intérêts d'emprunt pour l'acquisition des parts de SCPI.",
    disadvantages:
      "Revenus fonciers de source française soumis au barème progressif de l'impôt sur le revenu et aux prélèvements sociaux de 17,2 % ; revenus financiers soumis au prélèvement forfaitaire unique de 31,4 % ; revenus de source étrangère imposés selon les conventions fiscales.",
  },
  {
    advantages:
      "Possibilité de bénéficier du régime micro-foncier (abattement de 30 %) si les revenus fonciers bruts n'excèdent pas 15 000 € par an et si le contribuable détient aussi directement au moins un immeuble donné en location nue. La déduction des intérêts d'emprunt suppose le régime réel.",
    disadvantages: "Valeur des parts, pour leur fraction représentative d'actifs immobiliers, incluse dans l'assiette de l'IFI.",
  },
];
