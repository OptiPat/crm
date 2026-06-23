/** Tableau récapitulatif — annexes Girardin industriel (G3F). */

import { ANNEXES_SCPI_PAGE5_TABLE_HEADER } from "@/lib/souscription-cif/annexes-rapport-scpi-page5";

export const ANNEXES_G3F_RECAP_TABLE_HEADER = ANNEXES_SCPI_PAGE5_TABLE_HEADER;

export const ANNEXES_G3F_RECAP_ROW_ADAPTATION_TITLE =
  "La recommandation formulée est adaptée au client ?";

export const ANNEXES_G3F_RECAP_ROW_ADAPTATION_CONTENT =
  "Oui, elle répond tant aux objectifs du Client, son profil, son horizon.";

export const ANNEXES_G3F_RECAP_ROW_OBJECTIFS_TITLE =
  "La recommandation est conforme aux objectifs ?";

export const ANNEXES_G3F_RECAP_ROW_OBJECTIFS_CONTENT =
  "Oui, le Client souhaite obtenir une réduction d'impôt immédiate.";

export const ANNEXES_G3F_RECAP_ROW_DUREE_TITLE =
  "La durée d'investissement est conforme à la situation particulière du client ?";

export const ANNEXES_G3F_RECAP_ROW_DUREE_CONTENT =
  "Oui. L'horizon du Client est de moyen/long terme.";

export const ANNEXES_G3F_RECAP_ROW_CONNAISSANCES_TITLE =
  "La recommandation est adaptée aux connaissances et à l'expérience du client ?";

export const ANNEXES_G3F_RECAP_ROW_CONNAISSANCES_CONTENT =
  "Oui. L'ensemble des informations, caractéristiques, risques financiers liés à cet investissement ont été présentés au Client au travers de documentation remise et également du présent rapport.";

export const ANNEXES_G3F_RECAP_ROW_RISQUE_TITLE =
  "La recommandation est adaptée au client vis-à-vis de son attitude à l'égard du risque et de sa capacité à subir des pertes ?";

export const ANNEXES_G3F_RECAP_ROW_RISQUE_CONTENT = `Oui. Cet investissement représente une faible partie du patrimoine financier du Client.
Le Client a une épargne de précaution suffisante lui permettant de faire face à un imprévu financier.
Cet investissement correspond à son profil de risque.`;

export const ANNEXES_G3F_RECAP_ROW_REEXAMEN_TITLE =
  "Les services ou instruments recommandés entraînent-ils un réexamen périodique ?";

export const ANNEXES_G3F_RECAP_ROW_REEXAMEN_CONTENT =
  "Non. Il s'agit d'une solution d'investissement ne permettant pas de procéder à une réévaluation périodique car elle est adossée à une obligation pour le Client de conservation des parts pendant 5 ans.";

/** Lignes du tableau récap annexes G3F. */
export const ANNEXES_G3F_RECAP_ROW_TEMPLATES: ReadonlyArray<{
  title: string;
  contentTemplate: string;
}> = [
  {
    title: ANNEXES_G3F_RECAP_ROW_ADAPTATION_TITLE,
    contentTemplate: ANNEXES_G3F_RECAP_ROW_ADAPTATION_CONTENT,
  },
  {
    title: ANNEXES_G3F_RECAP_ROW_OBJECTIFS_TITLE,
    contentTemplate: ANNEXES_G3F_RECAP_ROW_OBJECTIFS_CONTENT,
  },
  {
    title: ANNEXES_G3F_RECAP_ROW_DUREE_TITLE,
    contentTemplate: ANNEXES_G3F_RECAP_ROW_DUREE_CONTENT,
  },
  {
    title: ANNEXES_G3F_RECAP_ROW_CONNAISSANCES_TITLE,
    contentTemplate: ANNEXES_G3F_RECAP_ROW_CONNAISSANCES_CONTENT,
  },
  {
    title: ANNEXES_G3F_RECAP_ROW_RISQUE_TITLE,
    contentTemplate: ANNEXES_G3F_RECAP_ROW_RISQUE_CONTENT,
  },
  {
    title: ANNEXES_G3F_RECAP_ROW_REEXAMEN_TITLE,
    contentTemplate: ANNEXES_G3F_RECAP_ROW_REEXAMEN_CONTENT,
  },
];
