import { useEffect, useRef, useState } from "react";
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
import {
  sendEtiquetteBatch,
  type EtiquetteBatchSendProgress,
} from "@/lib/etiquettes/etiquette-batch-send";
import { notifyRelationChanged } from "@/lib/etiquettes/etiquette-events";
import { toast } from "sonner";

export function EtiquetteBatchSendDialog({
  items,
  open,
  onOpenChange,
  cgpConfig,
  onDone,
}: {
  items: EtiquetteEmailQueueItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cgpConfig: CgpConfig | null;
  onDone?: () => void;
}) {
  const [progress, setProgress] = useState<EtiquetteBatchSendProgress | null>(null);
  const [running, setRunning] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open) {
      setProgress(null);
      setRunning(false);
      abortRef.current?.abort();
      abortRef.current = null;
    }
  }, [open]);

  const start = async () => {
    if (items.length === 0 || running) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    try {
      const result = await sendEtiquetteBatch({
        items,
        cgp: cgpConfig,
        signal: controller.signal,
        onProgress: setProgress,
      });
      notifyRelationChanged();
      if (result.errors.length === 0) {
        toast.success(`${result.sent} email${result.sent > 1 ? "s" : ""} envoyé${result.sent > 1 ? "s" : ""}`);
      } else {
        toast.warning(
          `${result.sent} envoyé${result.sent > 1 ? "s" : ""}, ${result.errors.length} erreur${result.errors.length > 1 ? "s" : ""}`
        );
      }
      onDone?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur envoi groupé");
    } finally {
      setRunning(false);
    }
  };

  const pct =
    progress && progress.total > 0
      ? Math.round(((progress.sent + progress.errors.length) / progress.total) * 100)
      : 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !running && onOpenChange(o)}>
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
            Chaque destinataire recevra son email personnalisé. Le journal enregistrera chaque envoi.
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={running} onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button disabled={running || items.length === 0} onClick={() => void start()}>
            {running ? "Envoi en cours…" : `Envoyer ${items.length} email${items.length > 1 ? "s" : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
