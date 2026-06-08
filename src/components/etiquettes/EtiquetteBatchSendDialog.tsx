import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { EtiquetteEmailQueueItem } from "@/lib/api/tauri-etiquettes";
import type { CgpConfig } from "@/lib/api/tauri-settings";
import type { EtiquetteBatchSendProgress } from "@/lib/etiquettes/etiquette-batch-send";
import {
  isEtiquetteBatchSendRunning,
  startEtiquetteBatchSend,
  subscribeEtiquetteBatchSend,
} from "@/lib/etiquettes/etiquette-email-send-runner";
import { toast } from "sonner";

export function EtiquetteBatchSendDialog({
  items,
  open,
  onOpenChange,
  cgpConfig,
  onItemSent,
  onDone,
}: {
  items: EtiquetteEmailQueueItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cgpConfig: CgpConfig | null;
  onItemSent?: (item: EtiquetteEmailQueueItem, subject: string, sentAtSec: number) => void;
  onDone?: () => void;
}) {
  const [progress, setProgress] = useState<EtiquetteBatchSendProgress | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    return subscribeEtiquetteBatchSend((p, isRunning) => {
      setProgress(p);
      setRunning(isRunning);
    });
  }, []);

  const start = async () => {
    if (items.length === 0 || running || isEtiquetteBatchSendRunning()) return;
    onOpenChange(false);
    toast.info("Envoi en arrière-plan — vous pouvez continuer à utiliser le CRM.");
    try {
      await startEtiquetteBatchSend({
        items,
        cgp: cgpConfig,
        onItemSent,
        onDone,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur envoi groupé");
    }
  };

  const pct =
    progress && progress.total > 0
      ? Math.round(((progress.sent + progress.errors.length) / progress.total) * 100)
      : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Envoi groupé</DialogTitle>
          <DialogDescription>
            {items.length} email{items.length > 1 ? "s" : ""} sélectionné
            {items.length > 1 ? "s" : ""} — confirmation unique avant envoi.
          </DialogDescription>
        </DialogHeader>
        {running && progress ? (
          <div className="space-y-3 py-2">
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              {progress.sent + progress.errors.length} / {progress.total}
              {progress.currentName ? ` — ${progress.currentName}` : ""}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-2">
            Chaque destinataire recevra son email personnalisé. L&apos;envoi se poursuit en
            arrière-plan — barre de progression visible dans la file d&apos;envoi.
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button
            disabled={running || items.length === 0 || isEtiquetteBatchSendRunning()}
            onClick={() => void start()}
          >
            {running ? "Envoi en cours…" : `Envoyer ${items.length} email${items.length > 1 ? "s" : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
