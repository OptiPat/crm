import type { EtiquetteEmailQueueItem } from "@/lib/api/tauri-etiquettes";
import type { CgpConfig } from "@/lib/api/tauri-settings";
import {
  sendEtiquetteBatch,
  type EtiquetteBatchSendProgress,
} from "@/lib/etiquettes/etiquette-batch-send";
import {
  getEnvoisQueueCache,
  setEnvoisQueueCache,
} from "@/lib/etiquettes/etiquette-envois-cache";
import { notifyRelationChanged } from "@/lib/etiquettes/etiquette-events";
import { buildSentQueueItem } from "@/lib/etiquettes/etiquette-queue-incremental";
import { toast } from "sonner";

export type EtiquetteBatchSendListener = (
  progress: EtiquetteBatchSendProgress | null,
  running: boolean
) => void;

let running = false;
let progress: EtiquetteBatchSendProgress | null = null;
let abortController: AbortController | null = null;
const lockedContactEtiquetteIds = new Set<number>();
const listeners = new Set<EtiquetteBatchSendListener>();

function notifyListeners() {
  for (const listener of listeners) {
    listener(progress, running);
  }
}

function patchCacheAfterSent(
  item: EtiquetteEmailQueueItem,
  subject: string,
  sentAtSec: number
): void {
  const prev = getEnvoisQueueCache();
  if (!prev) return;
  const sentItem = buildSentQueueItem(item, sentAtSec, subject);
  const id = item.contact_etiquette_id;
  setEnvoisQueueCache({
    ...prev,
    ready: prev.ready.filter((row) => row.contact_etiquette_id !== id),
    scheduled: prev.scheduled.filter((row) => row.contact_etiquette_id !== id),
    sent: [sentItem, ...prev.sent.filter((row) => row.contact_etiquette_id !== id)],
  });
}

function unlockContactEtiquette(id: number): void {
  lockedContactEtiquetteIds.delete(id);
}

export function isEtiquetteBatchSendRunning(): boolean {
  return running;
}

/** Ligne incluse dans une salve en cours (pas encore traitée). */
export function isEtiquetteQueueItemBatchLocked(contactEtiquetteId: number): boolean {
  return lockedContactEtiquetteIds.has(contactEtiquetteId);
}

export function getEtiquetteBatchSendProgress(): EtiquetteBatchSendProgress | null {
  return progress;
}

export function subscribeEtiquetteBatchSend(listener: EtiquetteBatchSendListener): () => void {
  listeners.add(listener);
  listener(progress, running);
  return () => listeners.delete(listener);
}

export function abortEtiquetteBatchSend(): void {
  if (!running) return;
  abortController?.abort();
}

export async function startEtiquetteBatchSend(input: {
  items: EtiquetteEmailQueueItem[];
  cgp?: CgpConfig | null;
  onItemSent?: (item: EtiquetteEmailQueueItem, subject: string, sentAtSec: number) => void;
  onDone?: () => void;
}): Promise<EtiquetteBatchSendProgress> {
  if (running) {
    throw new Error("Un envoi groupé est déjà en cours.");
  }

  const controller = new AbortController();
  abortController = controller;
  running = true;
  progress = null;
  lockedContactEtiquetteIds.clear();
  for (const item of input.items) {
    lockedContactEtiquetteIds.add(item.contact_etiquette_id);
  }
  notifyListeners();

  try {
    const result = await sendEtiquetteBatch({
      items: input.items,
      cgp: input.cgp,
      signal: controller.signal,
      onProgress: (p) => {
        progress = p;
        if (p.lastProcessedContactEtiquetteId != null) {
          unlockContactEtiquette(p.lastProcessedContactEtiquetteId);
        }
        notifyListeners();
        if (p.lastSent) {
          patchCacheAfterSent(
            p.lastSent.item,
            p.lastSent.subject,
            p.lastSent.sentAtSec
          );
          input.onItemSent?.(p.lastSent.item, p.lastSent.subject, p.lastSent.sentAtSec);
        }
      },
    });

    notifyRelationChanged(undefined, {
      skipQueueReload: true,
      skipEtiquettesChanged: true,
    });

    if (controller.signal.aborted) {
      toast.info(
        `Envoi interrompu — ${result.sent} envoyé${result.sent > 1 ? "s" : ""}, ${result.errors.length} erreur${result.errors.length > 1 ? "s" : ""}.`
      );
    } else if (result.errors.length === 0) {
      toast.success(
        `${result.sent} email${result.sent > 1 ? "s" : ""} envoyé${result.sent > 1 ? "s" : ""}`
      );
    } else if (result.sent > 0) {
      toast.warning(
        `${result.sent} envoyé${result.sent > 1 ? "s" : ""}, ${result.errors.length} erreur${result.errors.length > 1 ? "s" : ""}`
      );
    } else {
      toast.error(`Échec : ${result.errors.length} erreur${result.errors.length > 1 ? "s" : ""}`);
    }

    input.onDone?.();
    return result;
  } finally {
    running = false;
    progress = null;
    abortController = null;
    lockedContactEtiquetteIds.clear();
    notifyListeners();
  }
}
