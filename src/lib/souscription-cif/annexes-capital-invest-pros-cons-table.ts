/** Tableau avantages / inconvénients — Capital investissement (§ 4.1). */

import type { AnnexesScpiProsConsRow } from "@/lib/souscription-cif/annexes-scpi-pros-cons-table";

export const ANNEXES_CAPITAL_INVEST_PROS_CONS_ROWS: ReadonlyArray<AnnexesScpiProsConsRow> = [
  {
    advantages: "Placement souple et accessible même avec de faibles montants.",
    disadvantages: "Aucune garantie en capital ni en rendement.",
  },
  {
    advantages:
      "Mutualisation des risques grâce à la diversification (géographique, sectorielle, etc.) et aux entreprises intégrées dans chaque fonds.",
    disadvantages:
      "Épargne bloquée pendant toute la durée d'investissement, pendant 7 ans minimum, prorogeable deux fois d'un an.",
  },
  {
    advantages:
      "Permet d'accéder à une classe d'actifs différenciante et complémentaire, peu accessible aux particuliers : PME et ETI.",
    disadvantages: "Faible liquidité des parts.",
  },
  {
    advantages:
      "La typologie des entreprises ciblées par le Capital Investissement permet d'offrir des perspectives de croissance élevées sur un horizon d'investissement moyen/long terme.",
    disadvantages:
      "Risque plus élevé, le fonds étant investi directement au capital des entreprises, la performance dépendra des résultats de celles-ci.",
  },
  {
    advantages: "Réduction d'impôt immédiate dès l'année de souscription.",
    disadvantages:
      "La réduction d'impôt est « one shot », elle nécessite de réinvestir à chaque fois pour la percevoir.",
  },
  {
    advantages: "Exonération d'impôt sur la plus-value.",
    disadvantages:
      "Plus-value soumise aux prélèvements sociaux au taux global de 17,2 %.",
  },
];

export const ANNEXES_CAPITAL_INVEST_SECTION32_SORTIE = `3.2. À la sortie

Les FIP et FCPI bénéficient d'une exonération d'impôt sur les plus-values réalisées lors de la liquidation du fonds.
En revanche, cette plus-value sera soumise aux prélèvements sociaux, prélevés directement par le gestionnaire. Le souscripteur recevra donc une somme exonérée d'impôt et nette de prélèvements sociaux.`;

export const ANNEXES_CAPITAL_INVEST_SECTION4_INTRO = `[u]4. Avantages et inconvénients[/u]

4.1. D'un point de vue économique et juridique`;

/** Niveau AMF indicatif Capital investissement (échelle 1–7). */
export const ANNEXES_CAPITAL_INVEST_AMF_RISK_LEVEL = 6;

/** Horizon de placement indicatif Capital investissement. */
export const ANNEXES_CAPITAL_INVEST_HORIZON_PLACEMENT = "> 10 ans";

export const ANNEXES_CAPITAL_INVEST_SECTION5_RISQUES = `[u]5. Les risques[/u]`;

export const ANNEXES_CAPITAL_INVEST_SECTION5_RISKS_BODY = `L'investissement en FIP et FCPI comporte des risques qu'il convient d'appréhender.
- Risque de perte en capital : Les FIP et FCPI n'offrent aucune garantie ni protection en capital. Il est donc possible que le capital initialement investi ne soit pas intégralement restitué. Par ailleurs, la valorisation du fonds pendant la vie du produit peut évoluer à la hausse et à la baisse.
- Risque lié au sous-jacent : Les FIP et FCPI investissent dans des entreprises innovantes ou régionales, cotées ou non cotées, de petite taille qui présentent un risque important et des risques spécifiques qu'il convient d'appréhender.
- Risque de liquidité : Les FIP et FCPI investissent dans des titres cotés ou non cotés présentant une faible liquidité. Les fonds peuvent donc éprouver des difficultés à céder les titres dans les délais et au prix souhaités. Ces éléments peuvent entraîner une baisse de la valeur liquidative.
- Risques liés aux instruments financiers : Les FIP et FCPI investissent principalement dans des titres cotés ou non cotés présentant des risques importants. Les actifs financiers détenus par les FIP et FCPI sont susceptibles d'entraîner différents risques : risque actions, risque de taux, risque de défaillance de l'émetteur.
- Risque lié à la gestion discrétionnaire : Les FIP et FCPI sont soumis à un risque lié à la gestion discrétionnaire dans le choix des cibles d'investissement et de l'allocation d'actifs.
- Durée de blocage : Les FIP et FCPI prévoient une durée minimale de blocage avant laquelle les investisseurs ne peuvent pas récupérer leur épargne (sauf cas de déblocage anticipé prévu au règlement).
- Risque fiscal : La réduction fiscale est conditionnée au respect par le fonds de certains ratios d'investissement. Par ailleurs, la fiscalité applicable peut évoluer du fait des changements législatifs ou de la doctrine. La réduction fiscale est également conditionnée au respect de l'engagement de conservation des parts de FIP et FCPI.

Le Client déclare avoir pris connaissance des risques liés à l'investissement.`;
