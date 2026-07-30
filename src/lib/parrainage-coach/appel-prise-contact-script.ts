/**
 * Script d'appel — étape « Prise de contact » (une fois le prospect au téléphone, après le SMS
 * d'anticipation). Déroulé terrain éprouvé : identification des frustrations → prise de conscience
 * → storytelling/mirroring → transition → réponse au « c'est quoi ? » → invitation.
 * Volontairement déterministe (pas de génération IA), comme `sms-anticipation-templates.ts`.
 */

import { formatDisplayName } from "./sms-anticipation-templates";

export interface AppelPriseContactStepVariantDef {
  id: string;
  label: string;
  template: string;
}

export interface AppelPriseContactStepDef {
  id: string;
  title: string;
  /** Texte par défaut (= 1ère variante si `variants` est renseigné). */
  template: string;
  /** Consigne terrain affichée à côté du titre (ex. « identifie 2-3 frustrations »). */
  note?: string;
  /** Réponse attendue du prospect (« Oui »/« Non »), affichée sous le script. */
  expectedReply?: string;
  /** Anticipation libre affichée sous le script (ex. « le prospect va sûrement demander... »). */
  headsUp?: string;
  /** Textes alternatifs sélectionnables (ex. « avec/sans covoiturage »). */
  variants?: AppelPriseContactStepVariantDef[];
}

export const APPEL_PRISE_CONTACT_STEPS: AppelPriseContactStepDef[] = [
  {
    id: "accroche",
    title: "Accroche & identification des frustrations",
    template:
      "Salut {{prenom}} ! Ça me fait plaisir de t'avoir. Tu me disais par SMS que c'était pas la folie au boulot... Qu'est-ce qui se passe exactement ?",
    note: "Identifie 2 ou 3 points de frustration chez le prospect.",
  },
  {
    id: "prise_conscience",
    title: "Prise de conscience",
    template: "Et du coup, tu te vois tenir encore longtemps dans ces conditions ?",
    expectedReply: "Non",
  },
  {
    id: "mirroring_permission",
    title: "Storytelling / mirroring — demande de permission",
    template:
      "Tu sais, j'ai été un peu dans la même situation que toi.\nTu veux que je t'explique ce que j'ai vécu ?",
    expectedReply: "Oui",
  },
  {
    id: "mirroring_recit",
    title: "Storytelling / mirroring — ton vécu & transition",
    template:
      "Comme tu le sais, je suis toujours chez [Nom de la boîte], mais à un moment j'en ai eu marre. Ce qui me pesait, c'était [reprendre 2-3 points]. Bref, exactement ce dont tu me parles. Et il y a deux mois, j'ai rencontré une personne qui m'a parlé de son métier, ça correspond à ce qui me manquait et j'ai décidé de démarrer.",
    note: "Reprendre 2-3 frustrations personnelles, si possible en écho à celles du prospect.",
    headsUp: "Le prospect va sûrement demander quel est le métier.",
  },
  {
    id: "reponse_invitation",
    title: "Réponse à « c'est quoi ? » & invitation",
    template:
      "Le mieux, c'est que tu viennes voir par toi-même : si c'est moi qui t'explique, je vais forcément t'en parler en bien, et ce qui me plaît à moi ne te conviendra pas forcément.\n\nEn plus, c'est un métier que tu peux tout à fait démarrer en parallèle de ce que tu fais aujourd'hui. Il n'y a rien à décider pour l'instant, l'idée c'est juste de venir voir si ça pourrait t'intéresser.\n\nEn tout cas, je te confirme que ça te permettrait de [reprendre les 3 besoins/frustrations]. Si c'est vraiment important pour toi, tu dois venir voir !\n\nSi je te réserve une place pour venir découvrir ce projet sur une journée découverte, est-ce que tu viendrais avec moi ?",
    note: "Reprendre avec ses propres mots les 2-3 besoins/frustrations identifiés à l'étape 1.",
    expectedReply: "Oui",
  },
  {
    id: "confirmation_date",
    title: "Confirmation de la date & blocage agenda",
    template:
      "Top ! La prochaine date, c'est le samedi [X] de 9h à 15h. Tu as de quoi noter pour bloquer le créneau dans ton agenda ?",
    note: "Adapter la date/l'horaire à la prochaine JD réelle.",
    expectedReply: "Oui",
  },
  {
    id: "logistique_rdv",
    title: "Logistique du rendez-vous",
    template:
      "Ça se passe à Montpellier au [Adresse]. Le mieux c'est qu'on y aille ensemble, je passe te récupérer ! Tu es dans quel coin samedi matin ?",
    note: "Adapter la ville/l'adresse à la prochaine JD réelle.",
    variants: [
      {
        id: "covoiturage",
        label: "Covoiturage",
        template:
          "Ça se passe à Montpellier au [Adresse]. Le mieux c'est qu'on y aille ensemble, je passe te récupérer ! Tu es dans quel coin samedi matin ?",
      },
      {
        id: "sans_covoiturage",
        label: "Sans covoiturage",
        template:
          "Ça se passe à Montpellier au [Adresse]. On se donne rendez-vous à 8h45 pour boire un café.",
      },
    ],
  },
  {
    id: "demande_recommandation",
    title: "Demande de recommandation",
    template:
      "Tant que j'y pense, tu as sûrement un pote ou un collègue qui est dans la même situation que toi non ?\n\nTop ! Propose-lui de t'accompagner et s'il est OK, préviens-moi d'ici 2-3 jours que je puisse bloquer sa place !",
    note: "Le 2ᵉ paragraphe s'utilise uniquement si le prospect répond positivement.",
  },
  {
    id: "cloture",
    title: "Clôture de l'appel",
    template: "Ça va être super, je t'envoie un lien d'inscription par SMS.\n\nÀ samedi, bises !",
  },
];

/**
 * Objections possibles pendant l'appel — indépendantes du fil des étapes ci-dessus, utilisables à
 * tout moment de la conversation.
 */
export const APPEL_PRISE_CONTACT_OBJECTIONS: AppelPriseContactStepDef[] = [
  {
    id: "obj_dis_en_plus",
    title: "« Tu peux m'en dire plus ? En quoi ça consiste ? »",
    template:
      "Je comprends tout à fait que tu veuilles en savoir plus ! Mais ce n'est pas un projet que je veux te partager sur le coin d'une table. C'est un métier qu'on détaille sur une journée complète, donc tu te doutes bien que je ne peux pas te l'expliquer en 2 minutes au téléphone. Tout ce que je peux te dire, c'est que ça offre de belles perspectives de carrière. Après, je ne te garantis pas que ça te convienne, le mieux est de t'en rendre compte par toi-même.",
  },
  {
    id: "obj_pas_le_temps",
    title: "« Je n'ai pas le temps / je travaille le samedi »",
    template:
      "Je comprends tout à fait.\n\nSi je te propose qu'on se prenne une petite heure en visio avec la personne qui me forme pour t'expliquer les grandes lignes, est-ce que ça t'irait mieux ?\n\nTop ! Ça te permettra de comprendre les bases, et si tu vois que ça peut te plaire, on avisera ensuite. Tu serais plutôt dispo mardi ou jeudi 18h30 ?",
    note: "Le dernier paragraphe s'utilise uniquement si le prospect répond positivement.",
  },
];

export function renderAppelPriseContactStep(template: string, prenom: string): string {
  return template.split("{{prenom}}").join(formatDisplayName(prenom || "toi"));
}
