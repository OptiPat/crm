import {
  markEtiquetteEmailSent,
  type EtiquetteEmailQueueItem,
} from "@/lib/api/tauri-etiquettes";
import { logEmailSendError } from "@/lib/api/tauri-email-send-log";
import { sendEmail } from "@/lib/api/tauri-email";
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
import {
  getEtiquetteQueueItemKey,
  isSameEtiquetteQueueItem,
} from "@/lib/etiquettes/etiquette-queue-item-key";
import { toast } from "sonner";

export type EtiquetteEmailSendActivity = {
  batchRunning: boolean;
  batchProgress: EtiquetteBatchSendProgress | null;
  individualRunning: boolean;
  individualLabel: string | null;
};

export type EtiquetteBatchSendListener = (
  progress: EtiquetteBatchSendProgress | null,
  running: boolean
) => void;

type ActivityListener = (activity: EtiquetteEmailSendActivity) => void;

let batchRunning = false;
let batchProgress: EtiquetteBatchSendProgress | null = null;
let individualRunning = false;
let individualLabel: string | null = null;
let abortController: AbortController | null = null;
const lockedQueueItemKeys = new Set<string>();
const batchListeners = new Set<EtiquetteBatchSendListener>();
const activityListeners = new Set<ActivityListener>();

function getActivity(): EtiquetteEmailSendActivity {
  return {
    batchRunning,
    batchProgress,
    individualRunning,
    individualLabel,
  };
}

function notifyListeners() {
  const activity = getActivity();
  for (const listener of activityListeners) {
    listener(activity);
  }
  for (const listener of batchListeners) {
    listener(batchProgress, batchRunning);
  }
}

function patchCacheAfterSent(
  item: EtiquetteEmailQueueItem,
  subject: string,
  sentAtSec: number,
  gmailMessageId?: string | null,
  gmailThreadId?: string | null
): void {
  const prev = getEnvoisQueueCache();
  if (!prev) return;
  const sentItem = buildSentQueueItem(item, sentAtSec, {
    subject,
    gmailMessageId,
    gmailThreadId,
  });
  setEnvoisQueueCache({
    ...prev,
    ready: prev.ready.filter((row) => !isSameEtiquetteQueueItem(row, item)),
    scheduled: prev.scheduled.filter((row) => !isSameEtiquetteQueueItem(row, item)),
    sent: [sentItem, ...prev.sent.filter((row) => !isSameEtiquetteQueueItem(row, item))],
  });
}

function unlockQueueItem(item: Pick<EtiquetteEmailQueueItem, "queue_row_kind" | "contact_etiquette_id">): void {
  lockedQueueItemKeys.delete(getEtiquetteQueueItemKey(item));
}

function assertNoConcurrentSend(): void {
  if (batchRunning) {
    throw new Error("Un envoi groupé est déjà en cours.");
  }
  if (individualRunning) {
    throw new Error("Un envoi est déjà en cours.");
  }
}

export function isEtiquetteBatchSendRunning(): boolean {
  return batchRunning;
}

export function isIndividualEtiquetteEmailSendRunning(): boolean {
  return individualRunning;
}

export function isEtiquetteEmailSendActive(): boolean {
  return batchRunning || individualRunning;
}

/** Ligne incluse dans une salve en cours (pas encore traitée) ou envoi individuel. */
export function isEtiquetteQueueItemBatchLocked(
  item: Pick<EtiquetteEmailQueueItem, "queue_row_kind" | "contact_etiquette_id">
): boolean {
  return lockedQueueItemKeys.has(getEtiquetteQueueItemKey(item));
}

export function getEtiquetteBatchSendProgress(): EtiquetteBatchSendProgress | null {
  return batchProgress;
}

export function subscribeEtiquetteBatchSend(listener: EtiquetteBatchSendListener): () => void {
  batchListeners.add(listener);
  listener(batchProgress, batchRunning);
  return () => batchListeners.delete(listener);
}

export function subscribeEtiquetteEmailSendActivity(
  listener: ActivityListener
): () => void {
  activityListeners.add(listener);
  listener(getActivity());
  return () => activityListeners.delete(listener);
}

export function abortEtiquetteBatchSend(): void {
  if (!batchRunning) return;
  abortController?.abort();
}

export function startIndividualEtiquetteEmailSend(input: {
  item: EtiquetteEmailQueueItem;
  subject: string;
  body: string;
  body_html?: string | null;
  onSent?: (meta: {
    subject: string;
    sentAtSec: number;
    gmailMessageId?: string | null;
    gmailThreadId?: string | null;
  }) => void;
}): void {
  assertNoConcurrentSend();

  const { item } = input;
  const name = `${item.contact_prenom} ${item.contact_nom}`.trim();
  lockedQueueItemKeys.add(getEtiquetteQueueItemKey(item));
  individualRunning = true;
  individualLabel = name;
  notifyListeners();

  void (async () => {
    try {
      const sent = await sendEmail({
        to_email: item.contact_email!,
        to_name: name,
        subject: input.subject,
        body: input.body,
        body_html: input.body_html ?? undefined,
      });
      try {
        await markEtiquetteEmailSent(
          item.contact_etiquette_id,
          sent.gmail_message_id,
          sent.gmail_thread_id,
          input.subject,
          input.body,
          item.queue_row_kind ?? "etiquette"
        );
      } catch (markError) {
        console.error(markError);
        toast.warning(
          "Email envoyé, mais l'enregistrement CRM a échoué — ne renvoyez pas sans vérifier la fiche."
        );
        input.onSent?.({ subject: input.subject, sentAtSec: Math.floor(Date.now() / 1000) });
        return;
      }
      const sentAtSec = Math.floor(Date.now() / 1000);
      patchCacheAfterSent(
        item,
        input.subject,
        sentAtSec,
        sent.gmail_message_id,
        sent.gmail_thread_id
      );
      notifyRelationChanged(item.contact_id, {
        skipQueueReload: true,
        skipEtiquettesChanged: true,
      });
      toast.success(`Email envoyé à ${name}`);
      input.onSent?.({
        subject: input.subject,
        sentAtSec,
        gmailMessageId: sent.gmail_message_id,
        gmailThreadId: sent.gmail_thread_id,
      });
    } catch (error) {
      console.error("Error sending etiquette email:", error);
      const hint = error instanceof Error ? error.message : "Erreur lors de l'envoi";
      await logEmailSendError({
        contactId: item.contact_id,
        contactEtiquetteId: item.contact_etiquette_id,
        etiquetteNom: item.queue_row_kind === "template" ? null : item.etiquette_nom,
        templateNom: item.queue_row_kind === "template" ? item.template_sujet : null,
        subject: input.subject,
        errorMessage: hint,
        sendMode: "individual",
      }).catch(() => {});
      toast.error(hint.includes("connexion") ? hint : `${hint} (Paramètres → Email)`);
    } finally {
      unlockQueueItem(item);
      individualRunning = false;
      individualLabel = null;
      notifyListeners();
    }
  })();
}

export async function startEtiquetteBatchSend(input: {
  items: EtiquetteEmailQueueItem[];
  cgp?: CgpConfig | null;
  onItemSent?: (
    item: EtiquetteEmailQueueItem,
    subject: string,
    sentAtSec: number,
    gmailMessageId?: string | null,
    gmailThreadId?: string | null
  ) => void;
  onDone?: () => void;
}): Promise<EtiquetteBatchSendProgress> {
  assertNoConcurrentSend();

  const controller = new AbortController();
  abortController = controller;
  batchRunning = true;
  batchProgress = null;
  lockedQueueItemKeys.clear();
  for (const item of input.items) {
    lockedQueueItemKeys.add(getEtiquetteQueueItemKey(item));
  }
  notifyListeners();

  try {
    const result = await sendEtiquetteBatch({
      items: input.items,
      cgp: input.cgp,
      signal: controller.signal,
      onProgress: (p) => {
        batchProgress = p;
        if (p.lastProcessedItem) {
          unlockQueueItem(p.lastProcessedItem);
        }
        notifyListeners();
        if (p.lastSent) {
          patchCacheAfterSent(
            p.lastSent.item,
            p.lastSent.subject,
            p.lastSent.sentAtSec,
            p.lastSent.gmailMessageId,
            p.lastSent.gmailThreadId
          );
          input.onItemSent?.(
            p.lastSent.item,
            p.lastSent.subject,
            p.lastSent.sentAtSec,
            p.lastSent.gmailMessageId,
            p.lastSent.gmailThreadId
          );
        }
      },
    });

    notifyRelationChanged(undefined, {
      skipQueueReload: true,
      skipEtiquettesChanged: true,
    });

    if (controller.signal.aborted) {
      toast.info(
        `Envoi interrompu — ${result.sent} envoyé${result.sent > 1 ? "s" : ""}, ${result.errors.length} erreur${result.errors.length > 1 ? "s" : ""}. Les emails déjà partis ne peuvent pas être rappelés.`
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
    batchRunning = false;
    batchProgress = null;
    abortController = null;
    lockedQueueItemKeys.clear();
    notifyListeners();
  }
}
