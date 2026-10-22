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
  isEtiquetteEmailSendActive,
  startEtiquetteBatchSend,
  subscribeEtiquetteBatchSend,
} from "@/lib/etiquettes/etiquette-email-send-runner";
import {
  getCampaignTemplateSendBlockReason,
  isCampaignTemplateSendBlocked,
} from "@/lib/etiquettes/etiquette-email-preview";
import { toast } from "sonner";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  batchRecipientLabel,
  splitBatchSendItems,
} from "@/components/etiquettes/etiquette-batch-send-split";
import { getEtiquetteQueueItemKey } from "@/lib/etiquettes/etiquette-queue-item-key";
import { userErrorMessage } from "@/lib/api/invoke-error";

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
  const [recipientsOpen, setRecipientsOpen] = useState(false);

  useEffect(() => {
    return subscribeEtiquetteBatchSend((p, isRunning) => {
      setProgress(p);
      setRunning(isRunning);
    });
  }, []);

  // Lignes bloquées (SCPI / Stellium : résumé à repréparer ; lien d'agenda introuvable) :
  // jamais envoyées, exclues du lot.
  const { sendable: sendableItems, blocked: blockedItems } = splitBatchSendItems(items, (i) =>
    isCampaignTemplateSendBlocked(i, cgpConfig)
      ? (getCampaignTemplateSendBlockReason(i, cgpConfig) ?? "Envoi bloqué")
      : null
  );
  const sendCount = sendableItems.length;

  const start = async () => {
    if (sendCount === 0 || running || isEtiquetteEmailSendActive()) return;
    onOpenChange(false);
    toast.info("Envoi en arrière-plan — vous pouvez continuer à utiliser le CRM.");
    try {
      await startEtiquetteBatchSend({
        items: sendableItems,
        cgp: cgpConfig,
        onItemSent,
        onDone,
      });
    } catch (e) {
      toast.error(userErrorMessage(e, "Erreur envoi groupé"));
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
          <div className="space-y-2 py-2">
            <p className="text-sm text-muted-foreground">
              Chaque destinataire recevra son email personnalisé. L&apos;envoi se poursuit en
              arrière-plan — barre de progression visible dans la file d&apos;envoi.
            </p>
            {blockedItems.length > 0 ? (
              <div className="text-xs text-amber-800 dark:text-amber-200 rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/30 p-2 space-y-1">
                <p className="font-medium">
                  {blockedItems.length} email{blockedItems.length > 1 ? "s" : ""} ne
                  {blockedItems.length > 1 ? " peuvent" : " peut"} pas partir et{" "}
                  {blockedItems.length > 1 ? "seront exclus" : "sera exclu"} de l&apos;envoi :
                </p>
                <ul className="max-h-32 overflow-y-auto space-y-0.5">
                  {blockedItems.map(({ item, reason }) => (
                    <li key={getEtiquetteQueueItemKey(item)}>
                      <span className="font-medium">{batchRecipientLabel(item)}</span> — {reason}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {sendCount > 0 ? (
              <div className="rounded-md border">
                <button
                  type="button"
                  className="flex w-full items-center gap-1 px-2 py-1.5 text-left text-sm font-medium hover:bg-muted/50"
                  aria-expanded={recipientsOpen}
                  onClick={() => setRecipientsOpen((o) => !o)}
                >
                  {recipientsOpen ?
                    <ChevronDown className="h-4 w-4" aria-hidden />
                  : <ChevronRight className="h-4 w-4" aria-hidden />}
                  Voir les destinataires ({sendCount})
                </button>
                {recipientsOpen ? (
                  <ul className="max-h-48 overflow-y-auto border-t px-3 py-2 text-sm space-y-0.5">
                    {sendableItems.map((item) => (
                      <li key={getEtiquetteQueueItemKey(item)} className="flex justify-between gap-3">
                        <span className="truncate">{batchRecipientLabel(item)}</span>
                        <span className="truncate text-muted-foreground">
                          {item.contact_email?.trim() || "pas d'email"}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button
            disabled={running || sendCount === 0 || isEtiquetteEmailSendActive()}
            onClick={() => void start()}
          >
            {running ?
              "Envoi en cours…"
            : blockedItems.length > 0 ?
              `Envoyer ${sendCount > 1 ? `les ${sendCount} autres` : sendCount === 1 ? "l'autre email" : "les autres"}`
            : `Envoyer ${sendCount} email${sendCount > 1 ? "s" : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
