/** Profil investisseur SRI (1–7) — libellés et définitions QPI (modèle CIF). */

export type SriProfile = {
  sri: number;
  /** Nom court (case QPI). */
  label: string;
  /** Définition QPI (texte client). */
  definition: string;
};

export const INVESTISSEUR_SRI_PROFILES: readonly SriProfile[] = [
  {
    sri: 1,
    label: "Sécurisé",
    definition:
      "Je souhaite limiter au minimum les variations de rendement même si cela limite aussi la rentabilité attendue.",
  },
  {
    sri: 2,
    label: "Prudent",
    definition:
      "Je souhaite faire fructifier mon épargne. Je cherche avant tout à valoriser le capital investi de façon modérée à travers une prise de risque limitée.",
  },
  {
    sri: 3,
    label: "Équilibré",
    definition:
      "Je cherche avant tout l'équilibre entre performance et prise de risque limitée. Je suis prêt à tolérer les hausses et les baisses des marchés en contrepartie d'un rendement potentiellement supérieur.",
  },
  {
    sri: 4,
    label: "Dynamique",
    definition:
      "Je recherche avant tout la croissance à long terme de mes placements. Je sais que les marchés sont parfois à la hausse, parfois à la baisse, et j'accepte un risque élevé pour augmenter le potentiel de rendement de mes placements.",
  },
  {
    sri: 5,
    label: "Dynamique +",
    definition:
      "Je recherche avant tout la croissance à long terme de mes placements. J'accepte des variations fortes de rendements et tolère des pertes en vue de tirer la meilleure rentabilité attendue.",
  },
  {
    sri: 6,
    label: "Offensif",
    definition:
      "Je suis à la recherche de placements spéculatifs. J'accepte de fortes variations des rendements et des pertes en capital, car je privilégie la rentabilité.",
  },
  {
    sri: 7,
    label: "Offensif +",
    definition:
      "Je suis à la recherche des placements les plus spéculatifs. J'accepte un risque élevé et un risque de fortes pertes en capital pour maximiser le potentiel de rendement de mes placements.",
  },
] as const;

const SRI_BY_VALUE = new Map(INVESTISSEUR_SRI_PROFILES.map((p) => [p.sri, p]));

export function isValidSri(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 7;
}

export function getSriProfile(sri: number | null | undefined): SriProfile | null {
  if (sri == null || !isValidSri(sri)) return null;
  return SRI_BY_VALUE.get(sri) ?? null;
}

/** Ex. « 4 — Dynamique » */
export function formatSriLabel(sri: number | null | undefined): string | null {
  const profile = getSriProfile(sri);
  if (!profile) return null;
  return `${profile.sri} — ${profile.label}`;
}

/** Ex. « SRI 4 — Dynamique : Je recherche… » */
export function formatSriWithDefinition(sri: number | null | undefined): string | null {
  const profile = getSriProfile(sri);
  if (!profile) return null;
  return `SRI ${profile.sri} — ${profile.label} : ${profile.definition}`;
}

/** Libellé court seul (ex. « Dynamique »). */
export function getSriProfileLabel(sri: number | null | undefined): string | null {
  return getSriProfile(sri)?.label ?? null;
}
