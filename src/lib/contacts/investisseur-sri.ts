/** Profil de risque investisseur QPI (échelle SRI 1–5). */

export const PROFIL_RISQUE_MAX = 5;

/** Glossaire QPI réglementaire. */
export const PROFIL_RISQUE_INVESTISSEUR_LABEL = "Profil de risque investisseur";
export const PROFIL_RISQUE_SRI_FIELD_LABEL = "Profil de risque investisseur (SRI 1–5)";
export const PROFIL_RISQUE_SRI_SCALE_LABEL = "SRI 1–5";
export const PROFIL_RISQUE_SRI_MISSING_LABEL = "SRI (profil investisseur)";

export type SriProfile = {
  sri: number;
  /** Nom court (case QPI). */
  label: string;
  /** Définition QPI réglementaire (voix « Vous »). */
  definition: string;
};

export const INVESTISSEUR_SRI_PROFILES: readonly SriProfile[] = [
  {
    sri: 1,
    label: "Sécurisé",
    definition:
      "Vous ne souhaitez pas prendre de risques dans vos placements afin de réaliser vos projets en toute sécurité. La protection de votre capital doit être assurée quel que soit votre horizon de placement.",
  },
  {
    sri: 2,
    label: "Prudent",
    definition:
      "Vous souhaitez prendre le minimum de risques dans vos placements afin de réaliser vos projets en toute sécurité. Votre faible tolérance au risque impose la sélection de supports à faible volatilité.",
  },
  {
    sri: 3,
    label: "Équilibré",
    definition:
      "Vous souhaitez maîtriser le degré de risque de vos placements tout en acceptant des fluctuations raisonnables de la valeur de votre capital pour en améliorer les performances.",
  },
  {
    sri: 4,
    label: "Dynamique",
    definition:
      "Vous êtes prêt à vous positionner en partie sur des marchés volatils en contrepartie d'une espérance de gain élevé. De ce fait, vous êtes prêt à accepter d'importantes fluctuations de la valeur de votre capital dans le temps.",
  },
  {
    sri: 5,
    label: "Offensif",
    definition:
      "Vous êtes prêt à accepter d'importantes fluctuations de la valeur de votre capital dans le temps.",
  },
] as const;

const SRI_BY_VALUE = new Map(INVESTISSEUR_SRI_PROFILES.map((p) => [p.sri, p]));

export function isValidSri(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= PROFIL_RISQUE_MAX;
}

export function getSriProfile(sri: number | null | undefined): SriProfile | null {
  if (sri == null || !isValidSri(sri)) return null;
  return SRI_BY_VALUE.get(sri) ?? null;
}

/** Ex. « 4/5 — Dynamique » */
export function formatSriLabel(sri: number | null | undefined): string | null {
  const profile = getSriProfile(sri);
  if (!profile) return null;
  return `${profile.sri}/${PROFIL_RISQUE_MAX} — ${profile.label}`;
}

/** Ex. « SRI 4/5 — Dynamique : Vous êtes prêt… » */
export function formatSriWithDefinition(sri: number | null | undefined): string | null {
  const profile = getSriProfile(sri);
  if (!profile) return null;
  return `SRI ${profile.sri}/${PROFIL_RISQUE_MAX} — ${profile.label} : ${profile.definition}`;
}

/** Définition QPI seule (sans en-tête SRI). */
export function getSriDefinition(sri: number | null | undefined): string | null {
  return getSriProfile(sri)?.definition ?? null;
}

/** Libellé court seul (ex. « Dynamique »). */
export function getSriProfileLabel(sri: number | null | undefined): string | null {
  return getSriProfile(sri)?.label ?? null;
}
