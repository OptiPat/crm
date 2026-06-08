import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  abortEtiquetteBatchSend,
  subscribeEtiquetteEmailSendActivity,
  type EtiquetteEmailSendActivity,
} from "@/lib/etiquettes/etiquette-email-send-runner";

/** Bannière globale — envoi groupé ou individuel en arrière-plan. */
export function EtiquetteEmailSendBanner() {
  const [activity, setActivity] = useState<EtiquetteEmailSendActivity>({
    batchRunning: false,
    batchProgress: null,
    individualRunning: false,
    individualLabel: null,
  });

  useEffect(() => {
    return subscribeEtiquetteEmailSendActivity(setActivity);
  }, []);

  if (!activity.batchRunning && !activity.individualRunning) return null;

  if (activity.individualRunning && !activity.batchRunning) {
    return (
      <div
        className="border-b border-primary/20 bg-primary/5 px-4 py-2 flex items-center gap-2 text-sm"
        role="status"
        aria-live="polite"
      >
        <Loader2 className="h-4 w-4 animate-spin shrink-0 text-primary" />
        <span>
          Envoi en cours
          {activity.individualLabel ? ` — ${activity.individualLabel}` : ""}
          …
        </span>
      </div>
    );
  }

  const progress = activity.batchProgress;
  const done = progress ? progress.sent + progress.errors.length : 0;
  const total = progress?.total ?? 0;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div
      className="border-b border-primary/20 bg-primary/5 px-4 py-3 space-y-2"
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="font-medium">Envoi groupé en cours…</span>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground tabular-nums">
            {progress ? `${done} / ${total}` : "…"}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => abortEtiquetteBatchSend()}
          >
            Annuler
          </Button>
        </div>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      {progress?.currentName ? (
        <p className="text-xs text-muted-foreground truncate">{progress.currentName}</p>
      ) : null}
    </div>
  );
}
