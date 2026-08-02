import { useCallback, useState } from "react";
import { ArbitrageCompleteDialog } from "@/components/taches/ArbitrageCompleteDialog";
import {
  arbitrageDatesToUnix,
  isArbitrageAutoTask,
  type ArbitrageCompletePayload,
} from "@/lib/alertes/arbitrage-alerte";
import {
  completeArbitrageTache,
  setTacheStatut,
  type Tache,
} from "@/lib/api/tauri-taches";
import { spawnedNextTacheToastMessage } from "@/lib/taches/tache-recurrence-ui";
import { toast } from "sonner";

type TacheLike = Pick<Tache, "id" | "titre" | "statut">;

export function useArbitrageTacheDone(onAfterDone?: () => void) {
  const [target, setTarget] = useState<TacheLike | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const tryComplete = useCallback(
    async (tache: TacheLike) => {
      if (tache.statut === "FAIT") {
        try {
          await setTacheStatut(tache.id, "A_FAIRE");
          onAfterDone?.();
        } catch (error) {
          toast.error(`Erreur : ${String(error)}`);
        }
        return;
      }
      if (isArbitrageAutoTask(tache)) {
        setTarget(tache);
        return;
      }
      try {
        const result = await setTacheStatut(tache.id, "FAIT");
        const msg = spawnedNextTacheToastMessage(result);
        if (msg) toast.success(msg);
        onAfterDone?.();
      } catch (error) {
        toast.error(`Erreur : ${String(error)}`);
      }
    },
    [onAfterDone]
  );

  const confirmArbitrage = useCallback(
    async (payload: ArbitrageCompletePayload) => {
      if (!target) return;
      const parsed = arbitrageDatesToUnix(payload);
      if (!parsed) {
        toast.error("Dates invalides — le prochain arbitrage doit être après le dernier");
        return;
      }
      setSubmitting(true);
      try {
        await completeArbitrageTache(
          target.id,
          parsed.dateDernier,
          parsed.dateProchain,
          payload.note
        );
        toast.success("Arbitrage enregistré");
        setTarget(null);
        onAfterDone?.();
      } catch (error) {
        console.error(error);
        toast.error(`Erreur : ${String(error)}`);
      } finally {
        setSubmitting(false);
      }
    },
    [onAfterDone, target]
  );

  const dialog = (
    <ArbitrageCompleteDialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) setTarget(null);
      }}
      title="Arbitrage effectué"
      description={target?.titre}
      submitting={submitting}
      onConfirm={confirmArbitrage}
    />
  );

  return { tryComplete, dialog };
}
