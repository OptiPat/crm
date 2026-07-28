/**
 * Suivi terrain manuel du funnel JD (Journée Découverte) — panneau Organisation, section
 * « Tableau d'objectifs ». Les compteurs (« oui je viens », présents JD, parrainages) sont
 * incrémentés à la main par l'utilisateur au fil de l'exercice (pas de données contact fiables pour
 * automatiser ce funnel), et persistés en localStorage par exercice ciblé — l'exercice affiché ici
 * est souvent le SUIVANT (le funnel JD se travaille en amont, pendant l'exercice courant, pour
 * alimenter les inscriptions de l'exercice suivant), donc l'utilisateur choisit lui-même l'exercice
 * plutôt que de suivre l'exercice courant du reste du panneau.
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

type JdFunnelTrackerState = {
  targetExerciceLabel?: string;
  countsByExercice?: Record<string, JdFunnelCounts>;
};

const STORAGE_KEY = "crm_organisation_jd_funnel_tracker_v1";

function readState(): JdFunnelTrackerState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as JdFunnelTrackerState;
  } catch {
    return {};
  }
}

function writeState(state: JdFunnelTrackerState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

export function loadJdFunnelTrackerExerciceLabel(): string | undefined {
  return readState().targetExerciceLabel;
}

export function saveJdFunnelTrackerExerciceLabel(exerciceLabel: string): void {
  writeState({ ...readState(), targetExerciceLabel: exerciceLabel });
}

export function loadJdFunnelCounts(exerciceLabel: string): JdFunnelCounts {
  return readState().countsByExercice?.[exerciceLabel] ?? EMPTY_JD_FUNNEL_COUNTS;
}

export function saveJdFunnelCounts(exerciceLabel: string, counts: JdFunnelCounts): void {
  const state = readState();
  writeState({
    ...state,
    countsByExercice: { ...state.countsByExercice, [exerciceLabel]: counts },
  });
}

/**
 * Progression (%) vers un objectif — non plafonnée : dépasser l'objectif doit se voir (ex. 150 %),
 * pas rester bloqué à 100 %. Null si l'objectif est inconnu ou nul.
 */
export function computeJdFunnelProgressPercent(current: number, target: number | null): number | null {
  if (target == null || target <= 0) return null;
  return Math.round((current / target) * 100);
}
