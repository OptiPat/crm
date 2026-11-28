import type { SouscriptionDossierFields } from "@/lib/souscription-cif/dossier-fields";

/** Champs du dossier préremplis depuis la fiche contact / foyer / documents importés. */
export type DossierAutoFieldKey =
  | "lieuNaissance"
  | "dateRio"
  | "dateQpi"
  | "objectifsClient"
  | "rappelDemande"
  | "niveauExperience";

export type DossierAutoValues = Partial<Record<DossierAutoFieldKey, string>>;

export type DossierAutoFieldSource = {
  key: DossierAutoFieldKey;
  /** Valeur actuelle tirée de la fiche / des documents (vide = rien à proposer). */
  fresh: string | null | undefined;
  /**
   * Anciens dossiers (sans valeur auto mémorisée) : textes types considérés comme non retouchés.
   */
  legacyAutoValues?: readonly string[];
  /** Anciens dossiers : le champ était toujours recopié depuis la fiche (jamais une saisie). */
  legacyAlwaysAuto?: boolean;
};

type AutoFieldsState = Pick<
  SouscriptionDossierFields,
  DossierAutoFieldKey | "autoValues" | "sourceValues"
>;

/**
 * Met à jour un champ prérempli tant que l'utilisateur ne l'a pas retouché :
 * vide, ou encore égal à la dernière valeur écrite automatiquement.
 * Une saisie manuelle n'est jamais écrasée ; une source vide n'efface rien.
 * La valeur lue dans la fiche est mémorisée (`sourceValues`) pour signaler ensuite
 * un champ retouché dont la source a changé (voir `listDossierSourceUpdates`).
 */
export function syncDossierAutoFields(
  existing: Pick<SouscriptionDossierFields, DossierAutoFieldKey | "autoValues"> &
    Partial<Pick<SouscriptionDossierFields, "sourceValues">>,
  sources: readonly DossierAutoFieldSource[]
): Partial<AutoFieldsState> {
  const patch: Partial<Pick<SouscriptionDossierFields, DossierAutoFieldKey>> = {};
  const previousAuto = existing.autoValues ?? {};
  const previousSource = existing.sourceValues ?? {};
  const autoValues: DossierAutoValues = { ...previousAuto };
  const sourceValues: DossierAutoValues = { ...previousSource };
  let autoChanged = false;
  let sourceChanged = false;

  for (const { key, fresh, legacyAutoValues, legacyAlwaysAuto } of sources) {
    const freshValue = fresh?.trim() ?? "";
    if (!freshValue) {
      // Plus de source (document supprimé…) : rien à proposer, l'alerte éventuelle disparaît.
      if (sourceValues[key] !== undefined) {
        delete sourceValues[key];
        sourceChanged = true;
      }
      // Source vide connue : une saisie faite ensuite sera signalée au premier import
      // (au lieu d'être prise pour un ancien dossier).
      if (previousAuto[key] === undefined) {
        autoValues[key] = "";
        autoChanged = true;
      }
      continue;
    }
    if (sourceValues[key] !== freshValue) {
      sourceValues[key] = freshValue;
      sourceChanged = true;
    }
    const current = existing[key] ?? "";
    const lastAuto = previousAuto[key];
    const untouched =
      !current.trim() ||
      current === freshValue ||
      (lastAuto !== undefined
        ? current === lastAuto
        : legacyAlwaysAuto === true || (legacyAutoValues ?? []).includes(current));
    if (!untouched) {
      // Ancien dossier retouché : la fiche actuelle sert de référence, sans alerte immédiate.
      if (lastAuto === undefined) {
        autoValues[key] = freshValue;
        autoChanged = true;
      }
      continue;
    }
    if (current !== freshValue) patch[key] = freshValue;
    if (autoValues[key] !== freshValue) {
      autoValues[key] = freshValue;
      autoChanged = true;
    }
  }

  return {
    ...patch,
    ...(autoChanged ? { autoValues } : {}),
    ...(sourceChanged ? { sourceValues } : {}),
  };
}
