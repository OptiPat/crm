/**
 * SMS d'anticipation (étape « À contacter ») — textes figés fournis par l'utilisateur, choisis
 * selon le profil relationnel du contact. Volontairement déterministe (pas de génération IA) :
 * ce sont des scripts terrain éprouvés, pas un point à laisser reformuler par un modèle.
 */

export const SMS_ANTICIPATION_PROFILES = [
  "PROCHE_AMI",
  "PERDU_DE_VUE",
  "SURCHARGE",
  "OPPORTUNISTE",
  "PASSE_PARTOUT",
  "SENIOR_EXPERT",
  "PARENT_TRANSITION",
] as const;

export type SmsAnticipationProfile = (typeof SMS_ANTICIPATION_PROFILES)[number];

export const SMS_ANTICIPATION_VARIANTS = ["A", "B", "C"] as const;
export type SmsAnticipationVariant = (typeof SMS_ANTICIPATION_VARIANTS)[number];

interface SmsAnticipationVariantDef {
  label: string;
  template: string;
}

interface SmsAnticipationProfileDef {
  label: string;
  pourQui: string;
  variants: Partial<Record<SmsAnticipationVariant, SmsAnticipationVariantDef>>;
}

export const SMS_ANTICIPATION_PROFILE_DEFS: Record<SmsAnticipationProfile, SmsAnticipationProfileDef> = {
  PROCHE_AMI: {
    label: "🤝 Proche / Ami",
    pourQui:
      "Un ami, un bon copain, quelqu'un avec qui le tutoiement et la complicité sont naturels.",
    variants: {
      A: {
        label: "Variante A (Humour)",
        template:
          "Salut {{prenom}} ! Je venais voir si tu survivais toujours à ton boulot ou si tu avais déjà posé ta démission ? 😂 Comment va la famille sinon ?",
      },
      B: {
        label: "Variante B (Empathie)",
        template:
          "Coucou {{prenom}} ! Petit message pour prendre des nouvelles. Comment va la famille ? Et de ton côté, pas trop dur le boulot en ce moment ?",
      },
      C: {
        label: "Variante C (Cash)",
        template:
          "Salut {{prenom}} ! J'espère que tout va bien chez vous. Dis-moi franchement, niveau boulot c'est toujours la passion ou tu comptes les jours jusqu'aux prochaines vacances ? 😂",
      },
    },
  },
  PERDU_DE_VUE: {
    label: "⏳ Perdu de vue / Prise de contact douce",
    pourQui:
      "Un ancien collègue, une connaissance du cercle élargi qu'on n'a pas contactée depuis plusieurs mois/années.",
    variants: {
      A: {
        label: "Variante A (Souvenir)",
        template:
          "Salut {{prenom}} ! Je repensais à toi l'autre jour, ça fait un bail ! J'espère que tout va bien pour toi et la famille. Tu es toujours dans la même boîte ou tu as bougé depuis ?",
      },
      B: {
        label: "Variante B (Curiosité)",
        template:
          "Salut {{prenom}} ! Je pensais à toi l'autre jour et je me demandais ce que tu devenais ! La forme ? Tu es toujours sur les mêmes projets au boulot ou ça a un peu évolué ?",
      },
      C: {
        label: "Variante C (Actualité)",
        template:
          "Salut {{prenom}} ! J'espère que toute la famille va bien. Ça fait un moment ! Tu es toujours dans le même coin et dans le même boulot ?",
      },
    },
  },
  SURCHARGE: {
    label: "🎯 Cible surchargée / En manque de temps",
    pourQui:
      "Quelqu'un dont on sait déjà qu'il a des grosses journées, des enfants, ou une vie à 100 à l'heure.",
    variants: {
      A: {
        label: "Variante A (Temps libre)",
        template:
          "Coucou {{prenom}} ! J'espère que tout le monde va bien à la maison. De ton côté, tu arrives à te garder un peu de temps perso avec le boulot, ou c'est le rush permanent ?",
      },
      B: {
        label: "Variante B (Surcharge)",
        template:
          "Coucou {{prenom}} ! J'espère que tout va bien pour toi et la petite famille. Tu tiens le coup au boulot en ce moment ou c'est la grosse surcharge ?",
      },
      C: {
        label: "Variante C (Charge mentale)",
        template:
          "Coucou {{prenom}} ! J'espère que la forme va chez toi. Je me demandais si ça s'était un peu calmé au boulot ou si tu cours toujours autant après le temps ?",
      },
    },
  },
  OPPORTUNISTE: {
    label: "💼 Opportuniste / En réflexion pro",
    pourQui:
      "Un contact dynamique, un profil business, ou quelqu'un dont on sait qu'il cherche du changement.",
    variants: {
      A: {
        label: "Variante A (Avenir)",
        template:
          "Salut {{prenom}} ! Ça fait un bail, j'espère que tu vas bien ! Toujours autant à fond dans ton taf ou ça a changé de ton côté ?",
      },
      B: {
        label: "Variante B (Secteur/Boîte)",
        template:
          "Salut {{prenom}} ! Petit message pour prendre des nouvelles de la tribu ! Toujours dans le même secteur ? Toujours autant la passion ou ça commence à te lasser ?",
      },
      C: {
        label: "Variante C (Perspective)",
        template:
          "Salut {{prenom}} ! J'espère que tu vas bien. Côté pro, ça bouge un peu de ton côté ou c'est la routine en ce moment ?",
      },
    },
  },
  PASSE_PARTOUT: {
    label: "🛡️ Passe-partout / Prudence",
    pourQui: "Quand on ne sait pas trop dans quelle case ranger son prospect.",
    variants: {
      A: {
        label: "Variante A",
        template:
          "Coucou {{prenom}} ! J'espère que tu vas bien et toute la famille aussi. Je me demandais où tu en étais dans ton boulot ? Tu t'éclates toujours autant ou c'est la routine ?",
      },
      B: {
        label: "Variante B",
        template:
          "Coucou {{prenom}} ! Ça fait un moment. J'espère que tout roule pour toi. Toujours au même endroit niveau boulot ou ça a changé récemment ?",
      },
    },
  },
  SENIOR_EXPERT: {
    label: "🏆 Cadre confirmé / Manager",
    pourQui:
      "Quelqu'un qui a déjà une bonne situation, une carrière établie, du leadership ou une grosse expérience pro. On ne lui parle pas de « galères », mais de plafonnement ou de reconversion.",
    variants: {
      A: {
        label: "Variante A (Perspective)",
        template:
          "Salut {{prenom}} ! Comment vas-tu ainsi que tes proches ? Côté pro, toujours aussi épanoui dans ce que tu fais ou tu commences à avoir envie d'autre chose ?",
      },
      B: {
        label: "Variante B (Challenge)",
        template:
          "Coucou {{prenom}} ! J'espère que tout va bien pour toi. Côté boulot, toujours à fond sur tes projets ou tu commences à avoir envie de nouveaux challenges ?",
      },
      C: {
        label: "Variante C (Liberté)",
        template:
          "Salut {{prenom}} ! Petit coucou pour prendre des nouvelles. Ton poste te laisse toujours autant de flexibilité qu'avant ou la pression a augmenté ?",
      },
    },
  },
  PARENT_TRANSITION: {
    label: "🏠 Parent au foyer / En transition",
    pourQui:
      "Un contact en pause professionnelle, en reconversion ou qui s'occupe de ses enfants et qui envisage un retour à la vie active.",
    variants: {
      A: {
        label: "Variante A (Transition pro)",
        template:
          "Coucou {{prenom}} ! Comment va la petite famille ? De ton côté, tu en es où dans tes projets pro en ce moment ? Tu envisages de bouger ou tu prends ton temps ?",
      },
      B: {
        label: "Variante B (Équilibre)",
        template:
          "Salut {{prenom}} ! J'espère que tout le monde va bien à la maison. Tu arrives à trouver un bon rythme au quotidien ou c'est les journées à 1000 à l'heure ?",
      },
      C: {
        label: "Variante C (Projet perso)",
        template:
          "Coucou {{prenom}} ! Un petit message pour prendre des nouvelles ! Tu as pu avancer sur ce que tu voulais lancer/reprendre, ou c'est un peu en stand-by pour l'instant ?",
      },
    },
  },
};

/** Variantes réellement disponibles pour un profil (certains profils n'ont que A/B). */
export function availableSmsAnticipationVariants(
  profile: SmsAnticipationProfile
): SmsAnticipationVariant[] {
  const variants = SMS_ANTICIPATION_PROFILE_DEFS[profile].variants;
  return SMS_ANTICIPATION_VARIANTS.filter((v) => variants[v] !== undefined);
}

/** Normalise la casse d'un prénom (« test »/« TEST » → « Test »), aligné sur le backend Rust. */
export function formatDisplayName(raw: string): string {
  const trimmed = raw.trim();
  let result = "";
  let capitalizeNext = true;
  for (const ch of trimmed) {
    if (ch === " " || ch === "-" || ch === "'") {
      result += ch;
      capitalizeNext = true;
    } else if (capitalizeNext) {
      result += ch.toUpperCase();
      capitalizeNext = false;
    } else {
      result += ch.toLowerCase();
    }
  }
  return result;
}

export function renderSmsAnticipationTemplate(
  profile: SmsAnticipationProfile,
  variant: SmsAnticipationVariant,
  prenom: string
): string {
  const def = SMS_ANTICIPATION_PROFILE_DEFS[profile].variants[variant];
  const template = def?.template ?? SMS_ANTICIPATION_PROFILE_DEFS[profile].variants.A?.template ?? "";
  return template.split("{{prenom}}").join(formatDisplayName(prenom || "toi"));
}

/**
 * Relance après réponse du prospect au SMS d'anticipation (2ᵉ étape de la conversation) — pas de
 * prénom à substituer ici, ce sont des relances génériques selon la teneur de sa réponse.
 */
export const SMS_ANTICIPATION_REPLY_SCENARIOS = ["FRUSTRATION", "TOUT_VA_BIEN"] as const;
export type SmsAnticipationReplyScenario = (typeof SMS_ANTICIPATION_REPLY_SCENARIOS)[number];

export const SMS_ANTICIPATION_REPLY_OPTIONS = ["A", "B", "C"] as const;
export type SmsAnticipationReplyOption = (typeof SMS_ANTICIPATION_REPLY_OPTIONS)[number];

interface SmsAnticipationReplyOptionDef {
  label: string;
  template: string;
}

export interface SmsAnticipationReplyScenarioDef {
  label: string;
  pourQui: string;
  options: Record<SmsAnticipationReplyOption, SmsAnticipationReplyOptionDef>;
}

export const SMS_ANTICIPATION_REPLY_DEFS: Record<
  SmsAnticipationReplyScenario,
  SmsAnticipationReplyScenarioDef
> = {
  FRUSTRATION: {
    label: "S'il y a une frustration / envie de bouger",
    pourQui: "Le prospect exprime une frustration ou une envie de changement dans sa réponse.",
    options: {
      A: {
        label: "Option A (Simple & Empathique)",
        template:
          "Ah mince, je te comprends... Viens on se passe un coup de fil 5 min ! Tu as un moment ce soir vers 18h30 ou plutôt demain ?",
      },
      B: {
        label: "Option B (Spontanée)",
        template:
          "Mince, c'est pénible ça... Faut qu'on s'appelle 5 min ! Tu es dispo ce soir après le boulot ou plutôt demain ?",
      },
      C: {
        label: "Option C (Ultra directe)",
        template:
          "Ah oui, je comprends... Faut qu'on s'appelle 5 min, que tu me racontes tout. Tu as un moment ce soir ou demain ?",
      },
    },
  },
  TOUT_VA_BIEN: {
    label: "Si tout va bien pour lui (« Et toi ? »)",
    pourQui: "Le prospect va bien et te renvoie la question — c'est le moment de teaser ton déclic.",
    options: {
      A: {
        label: "Option A (Évolution & Dynamique)",
        template:
          "Écoute, au top ! Pas mal de nouveautés et de belles évolutions de mon côté en ce moment. Faut qu'on se cale 5 min au téléphone ! Tu es au calme ce soir ou plutôt demain ?",
      },
      B: {
        label: "Option B (Changement de rythme)",
        template:
          "Franchement super ! Ça bouge bien de mon côté, je suis sur une super dynamique. Dis, tu as 5 min ce soir ou demain qu'on se donne des nouvelles de vive voix ?",
      },
      C: {
        label: "Option C (Inattendue)",
        template:
          "Ça va très fort ! De gros changements positifs ces derniers temps, je te raconterai. Tu es dispo ce soir vers 18h30 ou plutôt demain ?",
      },
    },
  },
};

/**
 * Objection à la relance : l'interlocuteur insiste pour avoir les détails par SMS (« Ah bon ?
 * Dis-m'en plus par SMS », « Dis-moi par message plutôt stp ») plutôt que d'accepter l'appel.
 * Bloc affiché en complément du scénario de relance choisi (FRUSTRATION ou TOUT_VA_BIEN), pas une
 * 3ᵉ entrée du même menu : il faut recadrer vers l'appel sans rien dévoiler pour ne pas casser le
 * teasing, quel que soit le scénario initial.
 */
export const SMS_ANTICIPATION_INSISTE_SMS_DEF: SmsAnticipationReplyScenarioDef = {
  label: "S'il insiste pour avoir les détails par SMS",
  pourQui:
    "Le prospect répond « Ah bon ? Dis-m'en plus par SMS » ou « Dis-moi par message plutôt stp ».",
  options: {
    A: {
      label: "Option A (Rush)",
      template:
        "Franchement, par SMS ça va être un roman et je suis un peu dans le rush ! Je peux t'appeler ce soir ou plutôt demain ?",
    },
    B: {
      label: "Option B (Humour)",
      template:
        "Haha, tu me connais, je déteste écrire des pavés par SMS ! C'est beaucoup plus simple d'en parler 2 min de vive voix. Tu es dispo ce soir ou demain ?",
    },
    C: {
      label: "Option C (Direct)",
      template:
        "Par téléphone c'est plus simple à expliquer. Je peux t'appeler ce soir vers 18h30 ou plutôt demain ?",
    },
  },
};
