import { getContactById } from "@/lib/api/tauri-contacts";
import { sendEmail } from "@/lib/api/tauri-email";
import { logEmailSendError } from "@/lib/api/tauri-email-send-log";
import { getEmailConnectionStatus } from "@/lib/api/tauri-email-oauth";
import { getPipeById, type PipeRecord } from "@/lib/api/tauri-pipe";
import {
  getPlacementOperation,
  releasePlacementClientNotification,
  reservePlacementClientNotification,
  type PlacementOperation,
} from "@/lib/api/tauri-box-placement";
import {
  loadPlacementConformeTemplatePair,
  resolvePlacementConformeTemplateForOperation,
} from "@/lib/emails/template-email-placement-conforme";
import { getCgpConfig } from "@/lib/api/tauri-settings";
import {
  pickTemplateContentForRegistre,
  pickTemplateCorpsHtmlForRegistre,
  contactRegistreFromContact,
} from "@/lib/emails/template-email-formality";
import { canonicalizeTemplateCorpsHtml, sanitizeEmailHeaderValue } from "@/lib/emails/template-email-html";
import { renderTemplatePreview } from "@/lib/emails/template-email-meta";
import { buildPlacementConformeEmailExtraVariablesForSend } from "@/lib/placement/placement-conforme-email-vars";
import { resolvePlacementConformeRecipientContactIds } from "@/lib/placement/placement-conforme-recipients";
import { maybeAdvanceVersementAffaireToGagneeAfterClientMail } from "@/lib/placement/pipe-placement-tracking";
import { journalPlacementClientEmailSent } from "@/lib/placement/placement-journal";
import { placementOperationIsPipeTracked } from "@/lib/placement/placement-operations-ui";
import {
  coContactFieldsForRecipient,
  pipeRdvRegistreForContact,
} from "@/lib/pipe/pipe-rdv-email-vars";
import { toast } from "sonner";

export type PlacementConformeSendResult = {
  processed: number;
  /** Opérations entièrement notifiées (tous les destinataires couple). */
  sent: number;
  /** Nombre réel d'emails partis (peut être > sent si plusieurs ops). */
  emailsSent: number;
  skipped: number;
  errors: string[];
};

export type PlacementConformeOperationOutcome = {
  outcome: "sent" | "skipped" | "error";
  emailsSent: number;
};

function isValidRecipientEmail(email?: string | null): boolean {
  return Boolean(email?.trim().includes("@"));
}

function placementEligibleForClientEmail(operation: PlacementOperation): boolean {
  return (
    operation.status === "CONFORME" &&
    (operation.client_notified_at == null || operation.client_notified_at <= 0) &&
    placementOperationIsPipeTracked(operation)
  );
}

export async function sendPlacementConformeTemplatedEmail(options: {
  contactId: number;
  operation: PlacementOperation;
  pipe?: Pick<
    PipeRecord,
    | "contact_id"
    | "contact_prenom"
    | "contact_nom"
    | "secondary_contact_id"
    | "secondary_contact_prenom"
    | "secondary_contact_nom"
  > | null;
}): Promise<void> {
  const template = await resolvePlacementConformeTemplateForOperation(options.operation);
  if (!template) return;

  const contact = await getContactById(options.contactId);
  if (!isValidRecipientEmail(contact.email)) {
    throw new Error(`${contact.prenom} ${contact.nom} : pas d'email valide`);
  }

  const cgp = await getCgpConfig();
  const pipe = options.pipe ?? null;
  const registre = pipe
    ? pipeRdvRegistreForContact(contact, pipe)
    : contactRegistreFromContact(contact);
  const { principal, tutoiement } = await loadPlacementConformeTemplatePair(template.id);
  const content = pickTemplateContentForRegistre(principal, tutoiement, registre);
  const corpsHtml = pickTemplateCorpsHtmlForRegistre(
    principal.variables,
    tutoiement?.variables,
    registre
  );
  const coContactVars =
    pipe && contact.id != null ? coContactFieldsForRecipient(pipe, contact.id) : {};
  const extraVariables = {
    ...buildPlacementConformeEmailExtraVariablesForSend(options.operation),
    ...coContactVars,
  };
  const preview = renderTemplatePreview(
    content.sujet,
    content.corps,
    {
      prenom: sanitizeEmailHeaderValue(contact.prenom),
      nom: sanitizeEmailHeaderValue(contact.nom),
      email: contact.email ?? "",
      telephone: contact.telephone ?? "",
    },
    cgp,
    content.agenda_link_id ?? principal.agenda_link_id,
    content.variables ?? principal.variables,
    corpsHtml ? canonicalizeTemplateCorpsHtml(corpsHtml) : null,
    {
      templateNom: principal.nom,
      registre,
      extraVariables,
      forSend: true,
    }
  );

  await sendEmail({
    to_email: contact.email!.trim(),
    to_name: `${contact.prenom} ${contact.nom}`.trim(),
    subject: preview.subject,
    body: preview.body,
    body_html: preview.body_html,
  });
}

export async function maybeSendPlacementConformeEmailForOperation(
  operation: PlacementOperation,
  options?: { quiet?: boolean }
): Promise<PlacementConformeOperationOutcome> {
  if (!placementEligibleForClientEmail(operation)) {
    return { outcome: "skipped", emailsSent: 0 };
  }

  const template = await resolvePlacementConformeTemplateForOperation(operation);
  if (!template) return { outcome: "skipped", emailsSent: 0 };

  const emailStatus = await getEmailConnectionStatus();
  if (!emailStatus.connected) {
    if (!options?.quiet) {
      toast.warning(
        "Email Box Placement non envoyé — connectez Gmail ou Outlook dans Paramètres."
      );
    }
    return { outcome: "skipped", emailsSent: 0 };
  }

  let sentCount = 0;
  const errors: string[] = [];

  try {
    const reserved = await reservePlacementClientNotification(operation.id);
    if (!reserved) return { outcome: "skipped", emailsSent: 0 };

    let pipe: PipeRecord | null = null;
    let pipeLoadFailed = false;
    if (operation.pipe_id != null && operation.pipe_id > 0) {
      try {
        pipe = await getPipeById(operation.pipe_id);
      } catch {
        pipeLoadFailed = true;
        pipe = null;
      }
    }
    const recipientIds = resolvePlacementConformeRecipientContactIds(
      operation.contact_id,
      pipe
    );
    if (pipeLoadFailed && recipientIds.length < 2 && !options?.quiet) {
      toast.warning(
        "Pipe introuvable — email envoyé au seul contact de l'opération (couple non détecté)."
      );
    }

    try {
      for (const contactId of recipientIds) {
        try {
          await sendPlacementConformeTemplatedEmail({
            contactId,
            operation,
            pipe,
          });
          sentCount += 1;
        } catch (sendError) {
          const msg =
            sendError instanceof Error ? sendError.message : String(sendError);
          errors.push(msg);
          await logEmailSendError({
            contactId,
            errorMessage: msg,
            sendMode: "placement_conforme",
          }).catch(() => undefined);
        }
      }

      const allRecipientsNotified = sentCount === recipientIds.length;

      if (sentCount === 0) {
        await releasePlacementClientNotification(operation.id).catch(() => undefined);
        throw new Error(errors[0] ?? "Aucun email client envoyé");
      }

      if (!allRecipientsNotified) {
        await releasePlacementClientNotification(operation.id).catch(() => undefined);
        const partialMsg =
          recipientIds.length > 1
            ? `${sentCount}/${recipientIds.length} email(s) envoyé(s) — relance possible après correction. ${errors[0] ?? ""}`.trim()
            : (errors[0] ?? "Envoi partiel");
        if (!options?.quiet) {
          toast.warning(`Email Box Placement : ${partialMsg}`);
        }
        return { outcome: "error", emailsSent: sentCount };
      }

      const updated = await getPlacementOperation(operation.id);
      await journalPlacementClientEmailSent(updated).catch(() => undefined);
      await maybeAdvanceVersementAffaireToGagneeAfterClientMail(updated);
      return { outcome: "sent", emailsSent: sentCount };
    } catch (sendError) {
      if (sentCount === 0) {
        await releasePlacementClientNotification(operation.id).catch(() => undefined);
      }
      throw sendError;
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (!errors.length) {
      await logEmailSendError({
        contactId: operation.contact_id,
        errorMessage: msg,
        sendMode: "placement_conforme",
      }).catch(() => undefined);
    }
    if (!options?.quiet) {
      toast.warning(`Email Box Placement : ${msg}`);
    }
    return { outcome: "error", emailsSent: sentCount };
  }
}

export async function processPlacementConformeNotifications(
  operations: PlacementOperation[],
  options?: { quiet?: boolean }
): Promise<PlacementConformeSendResult> {
  const result: PlacementConformeSendResult = {
    processed: 0,
    sent: 0,
    emailsSent: 0,
    skipped: 0,
    errors: [],
  };

  for (const operation of operations) {
    if (!placementEligibleForClientEmail(operation)) {
      result.skipped += 1;
      continue;
    }
    result.processed += 1;
    const { outcome, emailsSent } = await maybeSendPlacementConformeEmailForOperation(
      operation,
      options
    );
    result.emailsSent += emailsSent;
    if (outcome === "sent") result.sent += 1;
    else if (outcome === "skipped") result.skipped += 1;
    else result.errors.push(`Opération #${operation.id}`);
  }

  return result;
}

export async function processPlacementConformeNotificationsByIds(
  operationIds: number[],
  loadOperation: (id: number) => Promise<PlacementOperation | null>,
  options?: { quiet?: boolean }
): Promise<PlacementConformeSendResult> {
  const operations: PlacementOperation[] = [];
  for (const id of operationIds) {
    const op = await loadOperation(id);
    if (op) operations.push(op);
  }
  return processPlacementConformeNotifications(operations, options);
}
