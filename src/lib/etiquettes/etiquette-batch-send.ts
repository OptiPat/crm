import {
  markEtiquetteEmailSent,
  type EtiquetteEmailQueueItem,
} from "@/lib/api/tauri-etiquettes";
import { logEmailSendError } from "@/lib/api/tauri-email-send-log";
import { sendEmail } from "@/lib/api/tauri-email";
import { getCgpConfig, type CgpConfig } from "@/lib/api/tauri-settings";
import { renderEtiquetteEmailPreview } from "@/lib/etiquettes/etiquette-email-preview";

export interface EtiquetteBatchSendProgress {
  sent: number;
  total: number;
  currentName?: string;
  /** Ligne en cours d'envoi (verrou UI). */
  currentContactEtiquetteId?: number;
  /** Dernière ligne traitée (succès ou erreur). */
  lastProcessedItem?: EtiquetteEmailQueueItem;
  errors: string[];
  batchId: string;
  /** Dernier envoi réussi (refresh incrémental UI). */
  lastSent?: {
    item: EtiquetteEmailQueueItem;
    subject: string;
    sentAtSec: number;
    gmailMessageId?: string | null;
    gmailThreadId?: string | null;
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function newBatchId(): string {
  return `batch-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Envoi groupé des lignes « Prêts » sélectionnées (Suivi → Envois). */
export async function sendEtiquetteBatch(input: {
  items: EtiquetteEmailQueueItem[];
  sendDelayMs?: number;
  cgp?: CgpConfig | null;
  signal?: AbortSignal;
  onProgress?: (progress: EtiquetteBatchSendProgress) => void;
}): Promise<EtiquetteBatchSendProgress> {
  const cgp = input.cgp ?? (await getCgpConfig());
  const batchId = newBatchId();
  const progress: EtiquetteBatchSendProgress = {
    sent: 0,
    total: input.items.length,
    errors: [],
    batchId,
  };
  input.onProgress?.(progress);

  for (const item of input.items) {
    if (input.signal?.aborted) break;
    const name = `${item.contact_prenom} ${item.contact_nom}`.trim();
    progress.currentName = name;
    progress.currentContactEtiquetteId = item.contact_etiquette_id;
    progress.lastProcessedItem = undefined;
    input.onProgress?.({ ...progress });

    if (!item.contact_email?.trim()) {
      const err = `${name} : pas d'email`;
      progress.errors.push(err);
      await logEmailSendError({
        contactId: item.contact_id,
        contactEtiquetteId: item.contact_etiquette_id,
        etiquetteNom:
          item.queue_row_kind === "template" ? null : item.etiquette_nom,
        templateNom:
          item.queue_row_kind === "template" ? item.template_sujet : null,
        errorMessage: err,
        batchId,
        sendMode: "batch",
      }).catch(() => {});
      progress.lastProcessedItem = item;
      progress.currentContactEtiquetteId = undefined;
      input.onProgress?.({ ...progress });
      continue;
    }

    try {
      const preview = renderEtiquetteEmailPreview(item, cgp);
      const sent = await sendEmail({
        to_email: item.contact_email,
        to_name: name,
        subject: preview.subject,
        body: preview.body,
        body_html: preview.body_html ?? undefined,
      });
      await markEtiquetteEmailSent(
        item.contact_etiquette_id,
        sent.gmail_message_id,
        sent.gmail_thread_id,
        preview.subject,
        preview.body,
        item.queue_row_kind ?? "etiquette",
        batchId,
        "batch"
      );
      progress.sent += 1;
      progress.lastSent = {
        item,
        subject: preview.subject,
        sentAtSec: Math.floor(Date.now() / 1000),
        gmailMessageId: sent.gmail_message_id,
        gmailThreadId: sent.gmail_thread_id,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      progress.errors.push(`${name} : ${msg}`);
      await logEmailSendError({
        contactId: item.contact_id,
        contactEtiquetteId: item.contact_etiquette_id,
        etiquetteNom:
          item.queue_row_kind === "template" ? null : item.etiquette_nom,
        templateNom:
          item.queue_row_kind === "template" ? item.template_sujet : null,
        subject: renderEtiquetteEmailPreview(item, cgp).subject,
        errorMessage: msg,
        batchId,
        sendMode: "batch",
      }).catch(() => {});
    }
    progress.lastProcessedItem = item;
    progress.currentContactEtiquetteId = undefined;
    input.onProgress?.({ ...progress });

    const done = progress.sent + progress.errors.length;
    if (done < input.items.length && (input.sendDelayMs ?? 300) > 0) {
      await sleep(input.sendDelayMs ?? 300);
    }
  }

  progress.currentName = undefined;
  progress.currentContactEtiquetteId = undefined;
  input.onProgress?.({ ...progress });
  return progress;
}
