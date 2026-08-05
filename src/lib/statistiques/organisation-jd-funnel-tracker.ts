/**
 * Suivi terrain manuel du funnel JD (Journée Découverte) — panneau Organisation, section
 * « Tableau d'objectifs ». Les compteurs (« oui je viens », présents JD, parrainages) sont
 * incrémentés à la main par l'utilisateur au fil de l'exercice.
 *
 * Persistance SQLite : voir `organisation-jd-funnel-tracker-storage.ts` (sauvegarde manuelle
 * via le bouton Enregistrer du tableau d'objectifs).
 */
export type JdFunnelCounts = {
  /** « Oui je viens » obtenus (confirmations avant la JD). */
  confirmations: number;
  /** Présents JD obtenus (réellement venus). */
  presences: number;
  /** Parrainages obtenus issus de ce funnel. */
  parrainages: number;
};

export const EMPTY_JD_FUNNEL_COUNTS: JdFunnelCounts = {
  confirmations: 0,
  presences: 0,
  parrainages: 0,
};

/**
 * Progression (%) vers un objectif — non plafonnée : dépasser l'objectif doit se voir (ex. 150 %),
 * pas rester bloqué à 100 %. Null si l'objectif est inconnu ou nul.
 */
export function computeJdFunnelProgressPercent(current: number, target: number | null): number | null {
  if (target == null || target <= 0) return null;
  return Math.round((current / target) * 100);
}
