/** Tableau récapitulatif — annexes SCPI (déclaration d'adéquation détaillée). */

export const ANNEXES_SCPI_RECAP_ROW_ADAPTATION_TITLE =
  "La recommandation formulée est adaptée au client ?";

export const ANNEXES_SCPI_RECAP_ROW_ADAPTATION_CONTENT = `La recommandation répond à la fois à sa situation, aux objectifs formulés par celui-ci, à son horizon de placement, à son profil investisseur (connaissance/expérience et profil risque) et à ses préférences en matière d'ESG.
L'ensemble de ces éléments figure dans le Recueil d'Information et le Questionnaire Profil Investisseur et ont été signés par le client.`;

export const ANNEXES_SCPI_RECAP_ROW_OBJECTIFS_TITLE =
  "La recommandation est conforme aux objectifs ?";

export const ANNEXES_SCPI_RECAP_ROW_OBJECTIFS_CONTENT = "{{rappel_demande}}";

export const ANNEXES_SCPI_RECAP_ROW_DUREE_TITLE =
  "La durée d'investissement est conforme à la situation particulière du client ?";

export const ANNEXES_SCPI_RECAP_ROW_DUREE_CONTENT =
  "Le client dispose d'une épargne de précaution suffisante qui lui permet de respecter l'horizon d'investissement.";

export const ANNEXES_SCPI_RECAP_ROW_CONNAISSANCES_TITLE =
  "La recommandation est adaptée aux connaissances et à l'expérience du client ?";

export const ANNEXES_SCPI_RECAP_ROW_CONNAISSANCES_CONTENT = `Le Client a un niveau « {{niveau_experience_qpi}} ».
Pour autant, il a eu l'ensemble des informations précontractuelles obligatoires au travers de la remise des documents : DIC, Statuts, Notice d'Information, BTI.`;

export const ANNEXES_SCPI_RECAP_ROW_RISQUE_TITLE =
  "La recommandation est adaptée au client vis-à-vis de son attitude à l'égard du risque et de sa capacité à subir des pertes ?";

export const ANNEXES_SCPI_RECAP_ROW_RISQUE_CONTENT =
  "Au regard de l'épargne de précaution, des investissements déjà réalisés et de la répartition de son patrimoine, cet investissement ne porte pas atteinte à son niveau de confort, ne déséquilibre pas son patrimoine (liquidité / illiquidité).";

export const ANNEXES_SCPI_RECAP_ROW_REEXAMEN_TITLE =
  "Les services ou instruments recommandés entraînent-ils un réexamen périodique ?";

export const ANNEXES_SCPI_RECAP_ROW_REEXAMEN_CONTENT =
  "Mise à jour annuelle des informations patrimoniales.";

/** Lignes du tableau récap annexes SCPI. */
export const ANNEXES_SCPI_RECAP_ROW_TEMPLATES: ReadonlyArray<{
  title: string;
  contentTemplate: string;
}> = [
  {
    title: ANNEXES_SCPI_RECAP_ROW_ADAPTATION_TITLE,
    contentTemplate: ANNEXES_SCPI_RECAP_ROW_ADAPTATION_CONTENT,
  },
  {
    title: ANNEXES_SCPI_RECAP_ROW_OBJECTIFS_TITLE,
    contentTemplate: ANNEXES_SCPI_RECAP_ROW_OBJECTIFS_CONTENT,
  },
  {
    title: ANNEXES_SCPI_RECAP_ROW_DUREE_TITLE,
    contentTemplate: ANNEXES_SCPI_RECAP_ROW_DUREE_CONTENT,
  },
  {
    title: ANNEXES_SCPI_RECAP_ROW_CONNAISSANCES_TITLE,
    contentTemplate: ANNEXES_SCPI_RECAP_ROW_CONNAISSANCES_CONTENT,
  },
  {
    title: ANNEXES_SCPI_RECAP_ROW_RISQUE_TITLE,
    contentTemplate: ANNEXES_SCPI_RECAP_ROW_RISQUE_CONTENT,
  },
  {
    title: ANNEXES_SCPI_RECAP_ROW_REEXAMEN_TITLE,
    contentTemplate: ANNEXES_SCPI_RECAP_ROW_REEXAMEN_CONTENT,
  },
];
