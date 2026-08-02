import { useCallback, useState } from "react";
import { toast } from "sonner";
import type { Tache } from "@/lib/api/tauri-taches";
import { createSuiviPipeFromFicheConseilTask, findExistingSuiviPipeForFicheConseilTask } from "@/lib/placement/create-suivi-from-fiche-conseil-task";
import { navigateToPipe } from "@/lib/navigation/pipe-navigation";

export function useSendFicheConseilTaskToPipe(onNavigate?: (page: string) => void) {
  const [sendToPipeBusyId, setSendToPipeBusyId] = useState<number | null>(null);

  const sendToPipe = useCallback(
    async (tache: Tache) => {
      if (!onNavigate) {
        toast.error("Navigation Pipe indisponible.");
        return;
      }
      setSendToPipeBusyId(tache.id);
      try {
        const contactId = tache.contacts[0]?.contact_id;
        if (!contactId) {
          toast.error("Aucun contact lié à cette tâche.");
          return;
        }
        const existing = await findExistingSuiviPipeForFicheConseilTask(tache, contactId);
        if (existing) {
          toast.info("Suivi déjà présent dans le Pipe — ouverture.");
          navigateToPipe(onNavigate, existing.id);
          return;
        }

        const { suivi, actDraftCreated } = await createSuiviPipeFromFicheConseilTask(tache);
        toast.success(
          actDraftCreated
            ? "Suivi créé dans le Pipe — arbitrage libre à confirmer"
            : "Suivi créé — choisissez le produit Stellium sur le pipe"
        );
        navigateToPipe(onNavigate, suivi.id);
      } catch (error) {
        console.error(error);
        toast.error(String(error));
      } finally {
        setSendToPipeBusyId(null);
      }
    },
    [onNavigate]
  );

  return { sendToPipe, sendToPipeBusyId };
}
