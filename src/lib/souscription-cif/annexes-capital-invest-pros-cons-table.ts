/** Tableau avantages / inconvénients — Capital investissement (§ 4.1). */

import type { AnnexesScpiProsConsRow } from "@/lib/souscription-cif/annexes-scpi-pros-cons-table";

export const ANNEXES_CAPITAL_INVEST_PROS_CONS_ROWS: ReadonlyArray<AnnexesScpiProsConsRow> = [
  {
    advantages: "Placement accessible même avec de faibles montants.",
    disadvantages: "Aucune garantie en capital ni en rendement.",
  },
  {
    advantages:
      "Mutualisation des risques grâce à la diversification (sectorielle, par stade de développement, etc.) et aux entreprises intégrées dans chaque fonds.",
    disadvantages:
      "Épargne bloquée pendant toute la durée d'investissement, soit 10 ans, prorogeable par la société de gestion.",
  },
  {
    advantages:
      "Permet d'accéder à une classe d'actifs différenciante et complémentaire, peu accessible aux particuliers : PME innovantes et ultramarines.",
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
    advantages:
      "FCPI JEI : réduction d'impôt hors plafonnement global des niches fiscales, avec des plafonds de versement élevés (75 000 € pour un célibataire / 150 000 € pour un couple), dans la limite de 50 000 € de réduction cumulée sur 2024–2028.",
    disadvantages:
      "FCPI JEI : la plus-value réalisée à la sortie n'est pas exonérée d'impôt (flat-tax).",
  },
  {
    advantages: "FIP Outre-Mer : 0 % d'impôt sur les produits et plus-values à la sortie.",
    disadvantages:
      "FIP Outre-Mer : produits et plus-values soumis aux prélèvements sociaux ; réduction d'impôt comprise dans le plafonnement global des niches fiscales.",
  },
];

export const ANNEXES_CAPITAL_INVEST_SECTION32_SORTIE = `3.2. À la sortie

- FCPI JEI : pour les souscriptions réalisées à compter du 21 février 2026, la réduction d'impôt obtenue à l'entrée n'ouvre pas droit à l'exonération des produits et plus-values (CGI, art. 150-0 A, I et III, et 163 quinquies B). Les produits et plus-values perçus à la sortie sont donc soumis au prélèvement forfaitaire unique (flat-tax : impôt sur le revenu et prélèvements sociaux).
- FIP Outre-Mer : les produits et plus-values perçus à la sortie sont exonérés d'impôt sur le revenu (0 %). Ils restent soumis aux prélèvements sociaux, prélevés directement par le gestionnaire. Le souscripteur reçoit donc une somme exonérée d'impôt et nette de prélèvements sociaux.

Les parts de FCPI JEI et de FIP Outre-Mer ne sont pas imposables à l'IFI.`;

export const ANNEXES_CAPITAL_INVEST_SECTION4_INTRO = `[u]4. Avantages et inconvénients[/u]

4.1. D'un point de vue économique et juridique`;

/** Niveau AMF indicatif Capital investissement (échelle 1–7). */
export const ANNEXES_CAPITAL_INVEST_AMF_RISK_LEVEL = 6;

/** Horizon de placement indicatif Capital investissement. */
export const ANNEXES_CAPITAL_INVEST_HORIZON_PLACEMENT = "10 ans";

export const ANNEXES_CAPITAL_INVEST_SECTION5_RISQUES = `[u]5. Les risques[/u]`;

export const ANNEXES_CAPITAL_INVEST_SECTION5_RISKS_BODY = `L'investissement en FCPI JEI et FIP Outre-Mer comporte des risques qu'il convient d'appréhender.
- Risque de perte en capital : Les fonds n'offrent aucune garantie ni protection en capital. Il est donc possible que le capital initialement investi ne soit pas intégralement restitué. Par ailleurs, la valorisation du fonds pendant la vie du produit peut évoluer à la hausse et à la baisse.
- Risque lié au sous-jacent : Les fonds investissent dans de jeunes entreprises innovantes ou des PME ultramarines, cotées ou non cotées, de petite taille qui présentent un risque important et des risques spécifiques qu'il convient d'appréhender.
- Risque spécifique aux JEI : Les FCPI JEI investissent dans des entreprises jeunes, souvent pas encore rentables et fortement dépendantes de leurs programmes de recherche et développement, dont le taux de défaillance est plus élevé que celui de PME établies.
- Risque de liquidité : Les fonds investissent dans des titres cotés ou non cotés présentant une faible liquidité. Les fonds peuvent donc éprouver des difficultés à céder les titres dans les délais et au prix souhaités. Ces éléments peuvent entraîner une baisse de la valeur liquidative.
- Risques liés aux instruments financiers : Les fonds investissent principalement dans des titres cotés ou non cotés présentant des risques importants. Les actifs financiers qu'ils détiennent sont susceptibles d'entraîner différents risques : risque actions, risque de taux, risque de défaillance de l'émetteur.
- Risque lié à la gestion discrétionnaire : Les fonds sont soumis à un risque lié à la gestion discrétionnaire dans le choix des cibles d'investissement et de l'allocation d'actifs.
- Durée de blocage : Les fonds prévoient une durée minimale de blocage (10 ans, prorogeable par la société de gestion) avant laquelle les investisseurs ne peuvent pas récupérer leur épargne (sauf cas de déblocage anticipé prévu au règlement).
- Risque fiscal : La réduction fiscale est conditionnée au respect par le fonds de certains ratios d'investissement. Par ailleurs, la fiscalité applicable peut évoluer du fait des changements législatifs ou de la doctrine. La réduction fiscale est également conditionnée au respect de l'engagement de conservation des parts jusqu'au 31 décembre de la cinquième année suivant celle de la souscription. Pour un FCPI JEI, la réduction est remise en cause si le fonds ne respecte pas son quota d'investissement en JEI, même si les parts sont conservées.

Le Client, catégorisé en clientèle non professionnelle, est informé que le produit souscrit est un produit dit complexe en raison de son niveau de complexité et/ou de risque. À ce titre, il bénéficie d'un accompagnement approprié et d'une information complète lui permettant d'appréhender l'investissement de manière claire, exacte et non trompeuse.
Important : préalablement à chaque investissement, il convient de consulter le Document d'Informations Clés (DIC), qui présente les informations essentielles sur le produit, ainsi que le Règlement du fonds, notamment la rubrique présentant les risques.

Le Client déclare avoir pris connaissance des risques liés à l'investissement.`;
