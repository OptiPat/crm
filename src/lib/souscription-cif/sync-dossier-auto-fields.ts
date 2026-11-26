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

/**
 * Met à jour un champ prérempli tant que l'utilisateur ne l'a pas retouché :
 * vide, ou encore égal à la dernière valeur écrite automatiquement.
 * Une saisie manuelle n'est jamais écrasée ; une source vide n'efface rien.
 */
export function syncDossierAutoFields(
  existing: Pick<SouscriptionDossierFields, DossierAutoFieldKey | "autoValues">,
  sources: readonly DossierAutoFieldSource[]
): Partial<Pick<SouscriptionDossierFields, DossierAutoFieldKey | "autoValues">> {
  const patch: Partial<Pick<SouscriptionDossierFields, DossierAutoFieldKey>> = {};
  const previousAuto = existing.autoValues ?? {};
  const autoValues: DossierAutoValues = { ...previousAuto };
  let autoChanged = false;

  for (const { key, fresh, legacyAutoValues, legacyAlwaysAuto } of sources) {
    const freshValue = fresh?.trim() ?? "";
    if (!freshValue) continue;
    const current = existing[key] ?? "";
    const lastAuto = previousAuto[key];
    const untouched =
      !current.trim() ||
      current === freshValue ||
      (lastAuto !== undefined
        ? current === lastAuto
        : legacyAlwaysAuto === true || (legacyAutoValues ?? []).includes(current));
    if (!untouched) continue;
    if (current !== freshValue) patch[key] = freshValue;
    if (autoValues[key] !== freshValue) {
      autoValues[key] = freshValue;
      autoChanged = true;
    }
  }

  return autoChanged ? { ...patch, autoValues } : patch;
}
