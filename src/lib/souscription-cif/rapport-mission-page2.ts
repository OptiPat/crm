/** Tableau récap — Rapport de mission page 2. */

export const RM_PAGE2_ROW_QUESTIONS_TITLE = "RAPPEL DES QUESTIONS POSÉES";

export const RM_PAGE2_ROW_QUESTIONS_CONTENT =
  "Pas de questions particulières de la part du Client.";

export const RM_PAGE2_ROW_MISSIONS_TITLE = "RAPPEL DES MISSIONS CONFIÉES";

export const RM_PAGE2_ROW_MISSIONS_CONTENT = `Le Conseiller recueille auprès du Client les informations nécessaires à l'appréciation de sa situation familiale, patrimoniale et financière, ses connaissances et ses expériences en matière financière, ainsi que ses objectifs afin d'apprécier le caractère adapté du service d'investissement fourni au Client.
Le Client est informé que toute modification des informations pouvant affecter significativement la nature ou l'orientation de la mission de conseil devra être portée à la connaissance du Conseiller.
Le Client est informé que le Conseiller délivrera un conseil défini comme non indépendant au sens de l'article 325-5 du Règlement général de l'AMF, dans le respect de l'obligation d'agir au mieux des intérêts du client. Ce conseil se limite à la gamme de produits sélectionnés et référencés par Stellium Invest auprès de sociétés de gestion et d'émetteurs de titres avec lesquels Stellium Invest est lié contractuellement.
Stellium Invest peut percevoir et conserver des rémunérations, commissions ou avantages monétaires ou non monétaires en rapport avec la fourniture de la prestation de conseil, versés ou fournis par un tiers (notamment les sociétés de gestion et les émetteurs des titres) ou par une personne agissant pour le compte d'un tiers, sous réserve du respect des règles sur les avantages et rémunérations imposant l'information du client, l'obligation d'amélioration du service et le respect de l'obligation d'agir au mieux des intérêts du client.
Stellium Invest rétrocède au Conseiller une partie des commissions ou avantages non monétaires en rapport avec la fourniture de la prestation de conseil.`;

export const RM_PAGE2_ROW_OBJECTIFS_TITLE = "RAPPEL DES OBJECTIFS";

export const RM_PAGE2_ROW_ANALYSE_TITLE = "ANALYSE DE LA SITUATION";

export const RM_PAGE2_ROW_ANALYSE_INTRO =
  "L'étude patrimoniale qui vous a été remise le {{date_rio}} reprend l'ensemble de votre situation, profil et objectifs.";

export const RM_PAGE2_ROW_ANALYSE_CONTENT = `${RM_PAGE2_ROW_ANALYSE_INTRO}\n\n{{analyse_situation_client}}`;

export const RM_PAGE2_ROW_REPONSES_TITLE = "RÉPONSE AUX QUESTIONS POSÉES";

export const RM_PAGE2_ROW_DURABILITE_TITLE =
  "PRÉFÉRENCES ET JUSTIFICATION EN MATIÈRE DE DURABILITÉ";

export const RM_PAGE2_ROW_DURABILITE_CONTENT =
  "Le recueil des exigences et préférences extra-financières du projet et l'information de durabilité du projet sont repris dans le document « Annexe durabilité ».";

export const RM_PAGE2_ROW_PRECONISATION_TITLE = "PRÉCONISATION";

export const RM_PAGE2_ROW_PRECONISATION_CONTENT =
  "Vous trouverez en annexe l'ensemble de mes préconisations.";

export const RM_PAGE2_ROW_COUTS_TITLE = "INFORMATIONS SUR LES COÛTS ET FRAIS";

export const RM_PAGE2_ROW_COUTS_CONTENT =
  "Les informations sur les coûts et frais figurent dans la fiche « Attestation » en annexe des présentes.";

export const RM_PAGE2_ROW_COMPLEMENTAIRES_TITLE =
  "QUESTIONS RELATIVES À L'ANALYSE ET QUESTIONS COMPLÉMENTAIRES";

/** Lignes du tableau page 2 (demande, situation, questions, missions). */
export const RM_PAGE2_RECAP_ROW_TEMPLATES: ReadonlyArray<{
  title: string;
  contentTemplate: string;
}> = [
  { title: RM_PAGE2_ROW_QUESTIONS_TITLE, contentTemplate: RM_PAGE2_ROW_QUESTIONS_CONTENT },
  { title: RM_PAGE2_ROW_MISSIONS_TITLE, contentTemplate: RM_PAGE2_ROW_MISSIONS_CONTENT },
];

/** Lignes du tableau page 3 (objectifs → complémentaires). */
export const RM_PAGE3_RECAP_ROW_TEMPLATES: ReadonlyArray<{
  title: string;
  contentTemplate: string;
}> = [
  { title: RM_PAGE2_ROW_OBJECTIFS_TITLE, contentTemplate: "{{objectifs_client}}" },
  { title: RM_PAGE2_ROW_ANALYSE_TITLE, contentTemplate: RM_PAGE2_ROW_ANALYSE_CONTENT },
  { title: RM_PAGE2_ROW_REPONSES_TITLE, contentTemplate: "" },
  { title: RM_PAGE2_ROW_DURABILITE_TITLE, contentTemplate: RM_PAGE2_ROW_DURABILITE_CONTENT },
  { title: RM_PAGE2_ROW_PRECONISATION_TITLE, contentTemplate: RM_PAGE2_ROW_PRECONISATION_CONTENT },
  { title: RM_PAGE2_ROW_COUTS_TITLE, contentTemplate: RM_PAGE2_ROW_COUTS_CONTENT },
  {
    title: RM_PAGE2_ROW_COMPLEMENTAIRES_TITLE,
    contentTemplate: RM_PAGE2_ROW_QUESTIONS_CONTENT,
  },
];

export const RM_PAGE3_FAIT_A = "Fait à {{client_ville}}, le {{date_document}}.";

/** @deprecated Utiliser RM_PAGE3_FAIT_A */
export const RM_PAGE2_FAIT_A = RM_PAGE3_FAIT_A;

/** Colonne gauche — signature conseiller (l'espace manuscrit est ajouté en CSS). */
export const RM_PAGE2_SIGNATURE_LEFT = `Signature du conseiller :

« Lu et Approuvé »

{{cgp_nom_complet}}`;

/** Colonne droite — signature client(s) (l'espace manuscrit est ajouté en CSS). */
export const RM_PAGE2_SIGNATURE_RIGHT = `Signature du client :

Certifie avoir reçu le rapport de mission et déclaration d'adéquation

{{client_nom_prenom}}`;
