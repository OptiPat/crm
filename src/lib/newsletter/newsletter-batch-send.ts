import {
  markEtiquetteEmailSent,
  type EtiquetteEmailQueueItem,
} from "@/lib/api/tauri-etiquettes";
import {
  countNewsletterSendReady,
  finishNewsletterEditionSend,
  getNewsletterSendQueue,
  recordNewsletterEditionSend,
  startNewsletterEditionSend,
  getContactNewsletterUnsubscribedAt,
} from "@/lib/api/tauri-newsletter";
import { parseNewsletterTemplateMeta } from "@/lib/newsletter/newsletter-html";
import { sendEmail } from "@/lib/api/tauri-email";
import { getCgpConfig, type CgpConfig } from "@/lib/api/tauri-settings";
import { renderEtiquetteEmailPreview } from "@/lib/etiquettes/etiquette-email-preview";
import { notifyRelationChanged } from "@/lib/etiquettes/etiquette-events";

export interface NewsletterBatchSendProgress {
  sent: number;
  total: number;
  currentName?: string;
  errors: string[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Envoi groupé des destinataires d'une édition newsletter préparée. */
export async function sendNewsletterBatch(input: {
  etiquetteId: number;
  editionId: number;
  sendDelayMs: number;
  cgp?: CgpConfig | null;
  signal?: AbortSignal;
  onProgress?: (progress: NewsletterBatchSendProgress) => void;
}): Promise<NewsletterBatchSendProgress> {
  const cgp = input.cgp ?? (await getCgpConfig());
  const queue = await getNewsletterSendQueue(input.editionId);
  if (queue.length === 0) {
    throw new Error(
      "Aucun destinataire en file pour cette édition — annulez la préparation puis préparez à nouveau la campagne."
    );
  }
  // Jamais de newsletter sans sa mise en page (pied, lien de désinscription, mentions).
  if (!parseNewsletterTemplateMeta(queue[0].template_variables)?.newsletter_html) {
    throw new Error(
      "Mise en page de cette édition introuvable — annulez la préparation puis préparez à nouveau la campagne."
    );
  }

  const progress: NewsletterBatchSendProgress = {
    sent: 0,
    total: queue.length,
    errors: [],
  };
  input.onProgress?.(progress);

  await startNewsletterEditionSend(input.editionId);

  for (const item of queue) {
    if (input.signal?.aborted) break;
    if (!item.contact_email?.trim()) {
      const err = `${item.contact_prenom} ${item.contact_nom} : pas d'email`;
      progress.errors.push(err);
      await recordNewsletterEditionSend({
        editionId: input.editionId,
        contactEtiquetteId: item.contact_etiquette_id,
        errorMessage: err,
      }).catch(() => {});
      input.onProgress?.({ ...progress });
      continue;
    }

    progress.currentName = `${item.contact_prenom} ${item.contact_nom}`.trim();
    input.onProgress?.({ ...progress });

    // Désinscrit depuis le début du lot (synchro mail, fiche contact) : pas d'envoi.
    const unsubscribedAt = await getContactNewsletterUnsubscribedAt(item.contact_id).catch(
      () => null
    );
    if (unsubscribedAt != null) {
      progress.total -= 1;
      input.onProgress?.({ ...progress });
      continue;
    }

    try {
      const gmailMessageId = await sendNewsletterQueueItem(item, cgp);
      progress.sent += 1;
      await recordNewsletterEditionSend({
        editionId: input.editionId,
        contactEtiquetteId: item.contact_etiquette_id,
        gmailMessageId,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      progress.errors.push(`${progress.currentName} : ${msg}`);
      await recordNewsletterEditionSend({
        editionId: input.editionId,
        contactEtiquetteId: item.contact_etiquette_id,
        errorMessage: msg,
      }).catch(() => {});
    }
    input.onProgress?.({ ...progress });

    if (progress.sent + progress.errors.length < progress.total && input.sendDelayMs > 0) {
      await sleep(input.sendDelayMs);
    }
  }

  progress.currentName = undefined;
  input.onProgress?.({ ...progress });

  await finishNewsletterEditionSend({
    editionId: input.editionId,
    cancelled: input.signal?.aborted === true,
  });

  notifyRelationChanged(undefined, { skipEtiquettesChanged: true });

  return progress;
}

async function sendNewsletterQueueItem(
  item: EtiquetteEmailQueueItem,
  cgp: CgpConfig
): Promise<string | undefined> {
  const preview = renderEtiquetteEmailPreview(item, cgp);
  const sent = await sendEmail({
    to_email: item.contact_email!,
    to_name: `${item.contact_prenom} ${item.contact_nom}`.trim(),
    subject: preview.subject,
    body: preview.body,
    body_html: preview.body_html ?? undefined,
    // Même adresse que le lien « Se désinscrire » du pied de newsletter.
    list_unsubscribe_email: cgp.email?.trim() || null,
  });
  await markEtiquetteEmailSent(
    item.contact_etiquette_id,
    sent.gmail_message_id,
    sent.gmail_thread_id,
    preview.subject,
    preview.body
  );
  return sent.gmail_message_id ?? undefined;
}

export async function countNewsletterReady(
  etiquetteId: number,
  editionId?: number | null
): Promise<number> {
  return countNewsletterSendReady(etiquetteId, editionId);
}
