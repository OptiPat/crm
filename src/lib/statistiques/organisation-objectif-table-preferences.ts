/**
 * Persistance des hypothèses saisies dans le tableau d'objectifs interactif (panneau Organisation) —
 * pour ne pas perdre les valeurs personnalisées (croissance visée, attrition visée, taux et volumes
 * visés) à chaque navigation ou redémarrage de l'app.
 *
 * Une valeur n'est persistée QUE si elle diffère de la valeur observée par défaut au moment de la
 * saisie (cf. `saveOrganisationObjectifTablePrefs` — `undefined` supprime la clé) : ça permet au
 * bouton « réinitialiser » de repasser le champ en mode « suit automatiquement la valeur observée »
 * plutôt que de figer la valeur observée du jour comme une préférence permanente.
 */
export type OrganisationObjectifTablePrefs = {
  targetGrowthPercent?: number;
  attritionPercent?: number;
  targetPersonalVolume?: number;
  targetTeamAverageVolume?: number;
  targetTeamActiveRatePercent?: number;
  targetSponsorsRatePercent?: number;
  jdPresenceToRecruitRatePercent?: number;
  jdConfirmationToPresenceRatePercent?: number;
};

const STORAGE_KEY = "crm_organisation_objectif_table_v1";

function readPrefs(): OrganisationObjectifTablePrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as OrganisationObjectifTablePrefs;
  } catch {
    return {};
  }
}

function writePrefs(prefs: OrganisationObjectifTablePrefs): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

export function loadOrganisationObjectifTablePrefs(): OrganisationObjectifTablePrefs {
  return readPrefs();
}

/** `undefined` pour une clé retire la préférence enregistrée (retour au suivi automatique). */
export function saveOrganisationObjectifTablePrefs(
  update: Partial<Record<keyof OrganisationObjectifTablePrefs, number | undefined>>
): void {
  const next: OrganisationObjectifTablePrefs = { ...readPrefs() };
  for (const key of Object.keys(update) as (keyof OrganisationObjectifTablePrefs)[]) {
    const value = update[key];
    if (value === undefined) {
      delete next[key];
    } else {
      next[key] = value;
    }
  }
  writePrefs(next);
}
