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
        label: "Variante A (Empathique)",
        template:
          "Coucou {{prenom}} ! Petit message pour prendre des nouvelles. Comment va la famille ? Et de ton côté, pas trop dur le boulot en ce moment ?",
      },
      B: {
        label: "Variante B (Décontractée)",
        template:
          "Salut {{prenom}} ! Ça fait un bail. Tu tiens le coup au taf ou c'est la folie en ce moment ?",
      },
    },
  },
  PERDU_DE_VUE: {
    label: "⏳ Perdu de vue / Prise de contact douce",
    pourQui:
      "Un ancien collègue, une connaissance du cercle élargi qu'on n'a pas contactée depuis plusieurs mois/années.",
    variants: {
      A: {
        label: "Variante A (Souvenir simple)",
        template:
          "Salut {{prenom}} ! Je repensais à toi l'autre jour, ça fait un bail ! J'espère que tout va bien. Tu es toujours dans la même boîte ?",
      },
      B: {
        label: "Variante B (Nouvelles globales)",
        template:
          "Salut {{prenom}} ! J'espère que toute la famille va bien. Ça fait un moment ! C'est quoi les nouvelles de ton côté ?",
      },
    },
  },
  SURCHARGE: {
    label: "🎯 Cible surchargée / En manque de temps",
    pourQui:
      "Quelqu'un dont on sait déjà qu'il a des grosses journées, des enfants, ou une vie à 100 à l'heure.",
    variants: {
      A: {
        label: "Variante A (Rythme de vie)",
        template:
          "Coucou {{prenom}} ! J'espère que tout va bien à la maison. De ton côté, tu arrives à souffler un peu ou c'est toujours la course avec le boulot ?",
      },
      B: {
        label: "Variante B (Rush)",
        template:
          "Coucou {{prenom}} ! Petit message rapide pour prendre des nouvelles. Tu tiens le rythme en ce moment ou c'est le rush total au boulot ?",
      },
    },
  },
  OPPORTUNISTE: {
    label: "💼 Opportuniste / En réflexion pro",
    pourQui:
      "Un contact dynamique, un profil business, ou quelqu'un dont on sait qu'il cherche du changement.",
    variants: {
      A: {
        label: "Variante A (Évolution)",
        template:
          "Salut {{prenom}} ! J'espère que tout va bien. Toujours autant à fond dans ton taf ou tu as de nouveaux projets en vue ?",
      },
      B: {
        label: "Variante B (Mouvement)",
        template:
          "Salut {{prenom}} ! Ça fait un moment. Toujours au même endroit niveau boulot ou ça a un peu bougé de ton côté ?",
      },
    },
  },
  PASSE_PARTOUT: {
    label: "🛡️ Passe-partout / Prudence",
    pourQui: "Quand on ne sait pas trop dans quelle case ranger son prospect.",
    variants: {
      A: {
        label: "Variante A (Épanouissement)",
        template:
          "Coucou {{prenom}} ! J'espère que tu vas bien et toute la famille aussi. Tu t'éclates toujours autant dans ton boulot ou c'est la routine en ce moment ?",
      },
      B: {
        label: "Variante B (Ambiance générale)",
        template:
          "Coucou {{prenom}} ! J'espère que tout roule de ton côté. La forme au boulot ou les journées sont longues ?",
      },
    },
  },
  SENIOR_EXPERT: {
    label: "🏆 Cadre confirmé / Manager",
    pourQui:
      "Quelqu'un qui a déjà une bonne situation, une carrière établie, du leadership ou une grosse expérience pro. On ne lui parle pas de « galères », mais de plafonnement ou de reconversion.",
    variants: {
      A: {
        label: "Variante A (Pression)",
        template:
          "Salut {{prenom}} ! J'espère que tout va bien pour toi et les proches. Côté boulot, pas trop de pression en ce moment ?",
      },
      B: {
        label: "Variante B (Temps perso)",
        template:
          "Salut {{prenom}} ! Comment vas-tu ? Toujours autant sous l'eau au boulot ou tu arrives à garder du temps pour toi ?",
      },
    },
  },
  PARENT_TRANSITION: {
    label: "🏠 Parent au foyer / En transition",
    pourQui:
      "Un contact en pause professionnelle, en reconversion ou qui s'occupe de ses enfants et qui envisage un retour à la vie active.",
    variants: {
      A: {
        label: "Variante A",
        template:
          "Coucou {{prenom}} ! J'espère que tout le monde va bien. Tu en es où de ton côté, tu réattaques bientôt un projet pro ou tu profites encore ?",
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

const SMS_ANTICIPATION_SENT_META_RE =
  /^sms-anticipation-meta:([A-Z_]+):([ABC])\n\n([\s\S]*)$/;

function isSmsAnticipationProfile(value: string): value is SmsAnticipationProfile {
  return (SMS_ANTICIPATION_PROFILES as readonly string[]).includes(value);
}

/** Contenu persisté dans la timeline (SMS_ENVOYE) : métadonnées profil + texte envoyé. */
export function formatSmsAnticipationSentNote(
  profile: SmsAnticipationProfile,
  variant: SmsAnticipationVariant,
  text: string
): string {
  return `sms-anticipation-meta:${profile}:${variant}\n\n${text.trim()}`;
}

export function parseSmsAnticipationSentNote(contenu: string): {
  profile: SmsAnticipationProfile | null;
  variant: SmsAnticipationVariant | null;
  text: string;
} {
  const trimmed = contenu.trim();
  const match = trimmed.match(SMS_ANTICIPATION_SENT_META_RE);
  if (!match) {
    return { profile: null, variant: null, text: trimmed };
  }
  const profile = match[1];
  const variant = match[2];
  if (
    isSmsAnticipationProfile(profile) &&
    (SMS_ANTICIPATION_VARIANTS as readonly string[]).includes(variant)
  ) {
    return {
      profile,
      variant: variant as SmsAnticipationVariant,
      text: match[3].trim(),
    };
  }
  return { profile: null, variant: null, text: trimmed };
}

/** Libellé profil (avec émoticône) extrait d'une note SMS_ENVOYE, si disponible. */
export function smsAnticipationProfileLabelFromSentNote(contenu: string | null | undefined): string | null {
  if (!contenu?.trim()) return null;
  const { profile } = parseSmsAnticipationSentNote(contenu);
  return profile ? SMS_ANTICIPATION_PROFILE_DEFS[profile].label : null;
}

/** Texte SMS seul pour affichage historique (sans ligne meta). */
export function displaySmsAnticipationSentNote(contenu: string): string {
  return parseSmsAnticipationSentNote(contenu).text;
}

/** Profil extrait d'une note SMS_ENVOYE, si disponible. */
export function smsAnticipationProfileFromSentNote(
  contenu: string | null | undefined
): SmsAnticipationProfile | null {
  if (!contenu?.trim()) return null;
  return parseSmsAnticipationSentNote(contenu).profile;
}

export interface SmsAnticipationProfileReplyOption {
  id: string;
  label: string;
  template: string;
}

/** Relances « attente de réponse » spécifiques à un profil (un texte par type de réponse). */
export const SMS_ANTICIPATION_PROFILE_WAITING_REPLIES: Partial<
  Record<SmsAnticipationProfile, SmsAnticipationProfileReplyOption[]>
> = {
  PROCHE_AMI: [
    {
      id: "FRUSTRATION",
      label: "Frustration",
      template:
        "Ah mince... Je te comprends. Faut qu'on s'appelle 5 min, que tu me racontes. Tu as un moment ce soir ou demain vers 18h ?",
    },
    {
      id: "TIEDE",
      label: "Tiède",
      template:
        "Haha le fameux 'on fait avec' ! 😉 Faut qu'on s'appelle 5 min pour se donner de vraies nouvelles. Tu as un moment ce soir ou demain vers 18h ?",
    },
    {
      id: "ESQUIVE",
      label: "Esquive",
      template:
        "Tout va bien chez nous aussi merci ! Et le boulot alors, c'est si terrible que tu n'en parles pas ? 😂 Faut qu'on s'appelle 5 min, tu as un moment ce soir ou demain vers 18h ?",
    },
    {
      id: "POSITIF",
      label: "Positif",
      template:
        "Trop bien, ça fait plaisir à lire ! Faut qu'on se passe un coup de tél rapide pour se capter. Tu as 5 min ce soir ou demain vers 18h ?",
    },
  ],
};

export function smsAnticipationProfileWaitingReplies(
  profile: SmsAnticipationProfile | null | undefined
): SmsAnticipationProfileReplyOption[] | null {
  if (!profile) return null;
  return SMS_ANTICIPATION_PROFILE_WAITING_REPLIES[profile] ?? null;
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
