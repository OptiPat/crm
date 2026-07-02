/** Composition locale du brouillon anniversaire (miroir de messages.rs). */

export type BirthdayMessageRegistre = "TU" | "VOUS";
export type BirthdayContactGenre = "M" | "F" | "N";

export type BirthdayMessageProfileBodies = {
  tuM: string[];
  tuF: string[];
  tuN: string[];
  vousM: string[];
  vousF: string[];
  vousN: string[];
};

export type BirthdayMessageSettingsShape = {
  useCustom: boolean;
  bodiesTu: string[];
  bodiesVous: string[];
  profile: BirthdayMessageProfileBodies;
};

export type BirthdayBuiltinBodiesShape = {
  profile: BirthdayMessageProfileBodies;
};

export type BirthdayProfileSliceKey = keyof BirthdayMessageProfileBodies;

export const EMPTY_BIRTHDAY_PROFILE: BirthdayMessageProfileBodies = {
  tuM: [],
  tuF: [],
  tuN: [],
  vousM: [],
  vousF: [],
  vousN: [],
};

export function registreFromContact(registre: string): BirthdayMessageRegistre {
  return registre.trim().toUpperCase() === "TU" ? "TU" : "VOUS";
}

export function genreFromCivilite(civilite?: string | null): BirthdayContactGenre {
  const c = civilite?.trim().toUpperCase();
  if (c === "MME") return "F";
  if (c === "M") return "M";
  return "N";
}

export function profileSliceKey(
  registre: BirthdayMessageRegistre,
  genre: BirthdayContactGenre
): BirthdayProfileSliceKey {
  if (registre === "TU") {
    if (genre === "F") return "tuF";
    if (genre === "N") return "tuN";
    return "tuM";
  }
  if (genre === "F") return "vousF";
  if (genre === "N") return "vousN";
  return "vousM";
}

export function profileSliceLabel(key: BirthdayProfileSliceKey): string {
  const labels: Record<BirthdayProfileSliceKey, string> = {
    tuM: "Tutoiement — homme",
    tuF: "Tutoiement — femme",
    tuN: "Tutoiement — neutre",
    vousM: "Vouvoiement — homme",
    vousF: "Vouvoiement — femme",
    vousN: "Vouvoiement — neutre",
  };
  return labels[key];
}

/** Premier prénom affiché (aligné sur messages.rs). */
export function extractBirthdayPrenom(prenom: string, displayName: string): string {
  const source = prenom.trim() || displayName.trim();
  return source.split(/\s+/)[0] || "ami";
}

export const PRENOM_PLACEHOLDER = "{prenom}";

export function isFullVariantTemplate(text: string): boolean {
  const firstLine = text.trim().split("\n")[0]?.trim() ?? "";
  return firstLine.includes("joyeux anniversaire");
}

export function wrapBodyAsFullVariant(
  body: string,
  registre: BirthdayMessageRegistre
): string {
  const trimmed = body.trim();
  if (!trimmed) return "";
  if (isFullVariantTemplate(trimmed)) return trimmed;
  const salutation = registre === "TU" ? `Salut ${PRENOM_PLACEHOLDER}` : `Bonjour ${PRENOM_PLACEHOLDER}`;
  const closing = registre === "TU" ? "À très vite." : "À bientôt.";
  return `${salutation}, joyeux anniversaire !\n${trimmed}\n${closing}`;
}

export function applyVariantTemplate(template: string, prenom: string): string {
  const name = prenom.trim() || "Jean";
  return template.replace(/\{prenom\}/g, name).trim();
}

export function composeBirthdayMessagePreview(
  prenom: string,
  registre: BirthdayMessageRegistre,
  template: string
): string {
  return applyVariantTemplate(wrapBodyAsFullVariant(template, registre), prenom);
}

export function normalizeBirthdayMessageBodies(bodies: string[]): string[] {
  return bodies.map((b) => b.trim()).filter(Boolean);
}

export function normalizeBirthdayProfile(
  profile: BirthdayMessageProfileBodies
): BirthdayMessageProfileBodies {
  return {
    tuM: normalizeBirthdayMessageBodies(profile.tuM),
    tuF: normalizeBirthdayMessageBodies(profile.tuF),
    tuN: normalizeBirthdayMessageBodies(profile.tuN),
    vousM: normalizeBirthdayMessageBodies(profile.vousM),
    vousF: normalizeBirthdayMessageBodies(profile.vousF),
    vousN: normalizeBirthdayMessageBodies(profile.vousN),
  };
}

export function profileHasAnyBodies(profile: BirthdayMessageProfileBodies): boolean {
  return (Object.keys(profile) as BirthdayProfileSliceKey[]).some(
    (key) => normalizeBirthdayMessageBodies(profile[key]).length > 0
  );
}

export function pickProfileBodies(
  profile: BirthdayMessageProfileBodies,
  registre: BirthdayMessageRegistre,
  genre: BirthdayContactGenre
): string[] {
  const key = profileSliceKey(registre, genre);
  const primary = profile[key];
  if (normalizeBirthdayMessageBodies(primary).length > 0) {
    return primary;
  }
  if (genre === "N") {
    const registrePrefix = registre === "TU" ? "tu" : "vous";
    const m = profile[`${registrePrefix}M` as BirthdayProfileSliceKey];
    const f = profile[`${registrePrefix}F` as BirthdayProfileSliceKey];
    if (normalizeBirthdayMessageBodies(m).length > 0) return m;
    if (normalizeBirthdayMessageBodies(f).length > 0) return f;
  }
  return [];
}

export function syncBirthdayMessageUseCustom(
  settings: BirthdayMessageSettingsShape,
  patch: Partial<Omit<BirthdayMessageSettingsShape, "profile">> & {
    profile?: Partial<BirthdayMessageProfileBodies>;
  }
): BirthdayMessageSettingsShape {
  if ("useCustom" in patch && patch.useCustom === false) {
    const { profile: _profile, ...rest } = patch;
    return { ...settings, ...rest, useCustom: false };
  }

  const nextProfile: BirthdayMessageProfileBodies = patch.profile
    ? {
        tuM: patch.profile.tuM ?? settings.profile.tuM,
        tuF: patch.profile.tuF ?? settings.profile.tuF,
        tuN: patch.profile.tuN ?? settings.profile.tuN,
        vousM: patch.profile.vousM ?? settings.profile.vousM,
        vousF: patch.profile.vousF ?? settings.profile.vousF,
        vousN: patch.profile.vousN ?? settings.profile.vousN,
      }
    : settings.profile;
  const next: BirthdayMessageSettingsShape = {
    useCustom: settings.useCustom,
    bodiesTu: patch.bodiesTu ?? settings.bodiesTu,
    bodiesVous: patch.bodiesVous ?? settings.bodiesVous,
    profile: nextProfile,
  };

  const hasContent =
    profileHasAnyBodies(next.profile) ||
    normalizeBirthdayMessageBodies(next.bodiesTu).length > 0 ||
    normalizeBirthdayMessageBodies(next.bodiesVous).length > 0;
  const hasAnySlot =
    (Object.keys(next.profile) as BirthdayProfileSliceKey[]).some(
      (key) => next.profile[key].length > 0
    ) ||
    next.bodiesTu.length > 0 ||
    next.bodiesVous.length > 0;

  return {
    ...next,
    useCustom: hasContent || hasAnySlot ? true : false,
  };
}

export function profilesEqual(
  a: BirthdayMessageProfileBodies,
  b: BirthdayMessageProfileBodies
): boolean {
  return (Object.keys(a) as BirthdayProfileSliceKey[]).every((key) =>
    birthdayBodiesEqual(a[key], b[key])
  );
}

export function birthdayBodiesEqual(a: string[], b: string[]): boolean {
  const na = normalizeBirthdayMessageBodies(a);
  const nb = normalizeBirthdayMessageBodies(b);
  return na.length === nb.length && na.every((line, i) => line === nb[i]);
}

export function buildBirthdayEditorDraft(
  settings: BirthdayMessageSettingsShape,
  builtin: BirthdayBuiltinBodiesShape
): BirthdayMessageSettingsShape {
  if (settings.useCustom && profileHasAnyBodies(settings.profile)) {
    return { ...settings, profile: { ...settings.profile } };
  }
  return {
    useCustom: false,
    bodiesTu: [],
    bodiesVous: [],
    profile: { ...builtin.profile },
  };
}

export function resolveBirthdaySaveSettings(
  draft: BirthdayMessageSettingsShape,
  _builtin: BirthdayBuiltinBodiesShape
): BirthdayMessageSettingsShape {
  if (draft.useCustom === false) {
    return {
      useCustom: false,
      bodiesTu: [],
      bodiesVous: [],
      profile: EMPTY_BIRTHDAY_PROFILE,
    };
  }

  const profile = normalizeBirthdayProfile(draft.profile);

  return {
    useCustom: true,
    bodiesTu: [],
    bodiesVous: [],
    profile,
  };
}

/** Corps disponibles pour l'aperçu (brouillon → intégré si tranche vide). */
export function resolvePreviewTemplates(
  draft: BirthdayMessageSettingsShape,
  builtin: BirthdayBuiltinBodiesShape,
  registre: BirthdayMessageRegistre,
  genre: BirthdayContactGenre
): string[] {
  const fromDraft = normalizeBirthdayMessageBodies(
    pickProfileBodies(draft.profile, registre, genre)
  );
  if (fromDraft.length > 0) return fromDraft;
  return normalizeBirthdayMessageBodies(pickProfileBodies(builtin.profile, registre, genre));
}

/** Index stable par contact (aperçu panneau ; envoi = tirage aléatoire réel). */
export function previewVariantIndex(seed: string, count: number): number {
  if (count <= 1) return 0;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % count;
}

/** Exemples génériques pour démarrer (fictifs, dépôt public). */
export const BIRTHDAY_MESSAGE_STARTER_BODIES_TU = [
  "Salut {prenom}, joyeux anniversaire !\nProfite bien de ta journée, {prenom} — on se retrouve très vite.\nÀ très vite.",
  "Salut {prenom}, joyeux anniversaire !\nSi ton expérience était un actif financier, le rendement de cette année serait historique !\nÀ très vite.",
];

export const BIRTHDAY_MESSAGE_STARTER_BODIES_VOUS = [
  "Bonjour {prenom}, joyeux anniversaire !\nJe vous souhaite une excellente journée, {prenom}.\nÀ bientôt.",
  "Bonjour {prenom}, joyeux anniversaire !\nVotre capital temps produit des intérêts composés depuis des années — bel anniversaire !\nÀ bientôt.",
];
