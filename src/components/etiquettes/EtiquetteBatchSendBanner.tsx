import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { EtiquetteBatchSendProgress } from "@/lib/etiquettes/etiquette-batch-send";
import {
  abortEtiquetteBatchSend,
  subscribeEtiquetteBatchSend,
} from "@/lib/etiquettes/etiquette-email-send-runner";

/** Bannière globale Suivi — visible sur tous les onglets pendant un envoi groupé. */
export function EtiquetteBatchSendBanner() {
  const [progress, setProgress] = useState<EtiquetteBatchSendProgress | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    return subscribeEtiquetteBatchSend((p, isRunning) => {
      setProgress(p);
      setRunning(isRunning);
    });
  }, []);

  if (!running) return null;

  const done = progress ? progress.sent + progress.errors.length : 0;
  const total = progress?.total ?? 0;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div
      className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 space-y-2"
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
