import {
  rdvStageFromPlanOption,
  type PipeRdvPlanOption,
} from "@/lib/pipe/pipe-rdv-plan-option";
import { rdvStageFromEntryTitre } from "@/lib/pipe/pipe-rdv-stage";

type RdvTimelineLike = {
  entry_type: string;
  titre?: string | null;
};

/** Au moins un RDV R2 (ou sous-type) encore présent sur l'affaire. */
export function affaireHasR2Rdv(entries: readonly RdvTimelineLike[]): boolean {
  return entries.some(
    (entry) => entry.entry_type === "RDV" && rdvStageFromEntryTitre(entry.titre) === "R2"
  );
}

/**
 * Case « ne pas renvoyer le mail » : on planifie un R2 alors qu'un R2 existe déjà.
 * Le premier R2 envoie toujours le mail.
 */
export function offerSkipR2ConfirmationEmail(
  entries: readonly RdvTimelineLike[],
  planOption: PipeRdvPlanOption
): boolean {
  return rdvStageFromPlanOption(planOption) === "R2" && affaireHasR2Rdv(entries);
}
