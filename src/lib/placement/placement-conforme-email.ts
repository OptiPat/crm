import { getContactById } from "@/lib/api/tauri-contacts";
import { sendEmail } from "@/lib/api/tauri-email";
import { logEmailSendError } from "@/lib/api/tauri-email-send-log";
import { getEmailConnectionStatus } from "@/lib/api/tauri-email-oauth";
import {
  getPlacementOperation,
  releasePlacementClientNotification,
  reservePlacementClientNotification,
  type PlacementOperation,
} from "@/lib/api/tauri-box-placement";
import {
  loadPlacementConformeTemplatePair,
  resolvePlacementConformeTemplateForOperationType,
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
import { maybeAdvanceVersementAffaireToGagneeAfterClientMail } from "@/lib/placement/pipe-placement-tracking";
import { placementOperationIsPipeTracked } from "@/lib/placement/placement-operations-ui";
import { toast } from "sonner";

export type PlacementConformeSendResult = {
  processed: number;
  sent: number;
  skipped: number;
  errors: string[];
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
}): Promise<void> {
  const template = await resolvePlacementConformeTemplateForOperationType(
    options.operation.operation_type
  );
  if (!template) return;

  const contact = await getContactById(options.contactId);
  if (!isValidRecipientEmail(contact.email)) {
    throw new Error(`${contact.prenom} ${contact.nom} : pas d'email valide`);
  }

  const cgp = await getCgpConfig();
  const registre = contactRegistreFromContact(contact);
  const { principal, tutoiement } = await loadPlacementConformeTemplatePair(template.id);
  const content = pickTemplateContentForRegistre(principal, tutoiement, registre);
  const corpsHtml = pickTemplateCorpsHtmlForRegistre(
    principal.variables,
    tutoiement?.variables,
    registre
  );
  const extraVariables = buildPlacementConformeEmailExtraVariablesForSend(options.operation);
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
): Promise<"sent" | "skipped" | "error"> {
  if (!placementEligibleForClientEmail(operation)) return "skipped";

  const template = await resolvePlacementConformeTemplateForOperationType(
    operation.operation_type
  );
  if (!template) return "skipped";

  const emailStatus = await getEmailConnectionStatus();
  if (!emailStatus.connected) {
    if (!options?.quiet) {
      toast.warning(
        "Email Box Placement non envoyé — connectez Gmail ou Outlook dans Paramètres."
      );
    }
    return "skipped";
  }

  try {
    const reserved = await reservePlacementClientNotification(operation.id);
    if (!reserved) return "skipped";

    try {
      await sendPlacementConformeTemplatedEmail({
        contactId: operation.contact_id,
        operation,
      });
      const updated = await getPlacementOperation(operation.id);
      await maybeAdvanceVersementAffaireToGagneeAfterClientMail(updated);
      return "sent";
    } catch (sendError) {
      await releasePlacementClientNotification(operation.id).catch(() => undefined);
      throw sendError;
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await logEmailSendError({
      contactId: operation.contact_id,
      errorMessage: msg,
      sendMode: "placement_conforme",
    }).catch(() => undefined);
    if (!options?.quiet) {
      toast.warning(`Email Box Placement : ${msg}`);
    }
    return "error";
  }
}

export async function processPlacementConformeNotifications(
  operations: PlacementOperation[],
  options?: { quiet?: boolean }
): Promise<PlacementConformeSendResult> {
  const result: PlacementConformeSendResult = {
    processed: 0,
    sent: 0,
    skipped: 0,
    errors: [],
  };

  for (const operation of operations) {
    if (!placementEligibleForClientEmail(operation)) {
      result.skipped += 1;
      continue;
    }
    result.processed += 1;
    const outcome = await maybeSendPlacementConformeEmailForOperation(operation, options);
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
