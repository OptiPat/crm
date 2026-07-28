import type { YearlyGrowthLevers } from "./organisation-growth-projection";

/**
 * Persistance des surcharges d'hypothèses par année dans la projection sur 5 ans (panneau
 * Organisation) — clé = année (2 à 5, 1-based), valeur = uniquement les champs explicitement
 * modifiés pour cette année (les autres restent hérités en cascade, cf. `resolveYearlyGrowthLevers`).
 */
type ProjectionPrefsState = {
  overridesByYear?: Record<number, Partial<YearlyGrowthLevers>>;
};

const STORAGE_KEY = "crm_organisation_growth_projection_v1";

function readState(): ProjectionPrefsState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as ProjectionPrefsState;
  } catch {
    return {};
  }
}

function writeState(state: ProjectionPrefsState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

export function loadProjectionOverridesByYear(): Record<number, Partial<YearlyGrowthLevers>> {
  return readState().overridesByYear ?? {};
}

/** Un objet vide `{}` retire la surcharge de cette année (retour à l'héritage en cascade). */
export function saveProjectionYearOverride(year: number, override: Partial<YearlyGrowthLevers>): void {
  const state = readState();
  const overridesByYear = { ...state.overridesByYear };
  if (Object.keys(override).length === 0) {
    delete overridesByYear[year];
  } else {
    overridesByYear[year] = override;
  }
  writeState({ ...state, overridesByYear });
}
