import { getContactById, type Contact } from "@/lib/api/tauri-contacts";
import { sendEmail } from "@/lib/api/tauri-email";
import { logEmailSendError } from "@/lib/api/tauri-email-send-log";
import { getEmailConnectionStatus } from "@/lib/api/tauri-email-oauth";
import type { PipeRecord } from "@/lib/api/tauri-pipe";
import {
  getTemplateEmailById,
  type TemplateEmail,
} from "@/lib/api/tauri-templates-email";
import { getCgpConfig } from "@/lib/api/tauri-settings";
import type { RdvVisioOptions } from "@/lib/calendar/rdv-visio";
import {
  pickTemplateContentForRegistre,
  pickTemplateCorpsHtmlForRegistre,
  pickTemplateVariablesForRegistre,
} from "@/lib/emails/template-email-formality";
import { canonicalizeTemplateCorpsHtml } from "@/lib/emails/template-email-html";
import { renderTemplatePreview } from "@/lib/emails/template-email-meta";
import { buildSendEmailAttachmentsFromTemplate } from "@/lib/emails/template-email-attachments";
import { resolvePipeRdvTemplateForStage } from "@/lib/emails/template-email-pipe-rdv";
import {
  buildPipeRdvEmailExtraVariables,
  pipeRdvRegistreForContact,
} from "@/lib/pipe/pipe-rdv-email-vars";
import {
  buildR1ChecklistEmailVariables,
  ensureR1ChecklistProfileForPipeEmail,
  templateUsesR1ChecklistEmailVariables,
} from "@/lib/pipe/pipe-r1-checklist-email-vars";
import { syncPipeRdvReminderSchedules } from "@/lib/pipe/pipe-rdv-reminder-schedule";
import type { PipeRdvStage } from "@/lib/pipe/pipe-rdv-stage";
import { toast } from "sonner";

export type PipeRdvConfirmationSendResult = {
  sent: number;
  errors: string[];
};

function isValidRecipientEmail(email?: string | null): boolean {
  return Boolean(email?.trim().includes("@"));
}

export async function loadPipeRdvTemplatePair(
  templateId: number
): Promise<{ principal: TemplateEmail; tutoiement: TemplateEmail | null }> {
  const principal = await getTemplateEmailById(templateId);
  let tutoiement: TemplateEmail | null = null;
  if (principal.tutoiement_template_id && principal.tutoiement_template_id > 0) {
    try {
      tutoiement = await getTemplateEmailById(principal.tutoiement_template_id);
    } catch {
      tutoiement = null;
    }
  }
  return { principal, tutoiement };
}

export async function sendPipeRdvTemplatedEmailToContact(options: {
  contact: Contact;
  pipe: Pick<
    PipeRecord,
    | "id"
    | "contact_id"
    | "contact_prenom"
    | "contact_nom"
    | "secondary_contact_id"
    | "secondary_contact_prenom"
    | "secondary_contact_nom"
  >;
  principal: TemplateEmail;
  tutoiement: TemplateEmail | null;
  rdvStage?: PipeRdvStage;
  startAtUnix: number;
  endAtUnix: number;
  visioLink?: string | null;
  eventLocation?: string | null;
  visio?: RdvVisioOptions;
  physicalAddress?: string | null;
}): Promise<void> {
  const cgp = await getCgpConfig();
  const registre = pipeRdvRegistreForContact(options.contact, options.pipe);
  const content = pickTemplateContentForRegistre(
    options.principal,
    options.tutoiement,
    registre
  );
  const corpsHtml = pickTemplateCorpsHtmlForRegistre(
    options.principal.variables,
    options.tutoiement?.variables,
    registre
  );
  const rdvVars = buildPipeRdvEmailExtraVariables({
    pipe: options.pipe,
    recipientContactId: options.contact.id,
    startAtUnix: options.startAtUnix,
    endAtUnix: options.endAtUnix,
    visioLink: options.visioLink,
    eventLocation: options.eventLocation,
    visio: options.visio,
    physicalAddress: options.physicalAddress,
  });

  const needsR1Docs =
    options.rdvStage === "R1" ||
    templateUsesR1ChecklistEmailVariables(content.sujet, content.corps, corpsHtml);

  if (needsR1Docs && options.pipe.id > 0) {
    const primaryContact =
      options.contact.id === options.pipe.contact_id
        ? options.contact
        : await getContactById(options.pipe.contact_id).catch(() => null);
    await ensureR1ChecklistProfileForPipeEmail(options.pipe.id, primaryContact);
  }

  const checklistVars = needsR1Docs
    ? await buildR1ChecklistEmailVariables(options.pipe.id)
    : {};

  const preview = renderTemplatePreview(
    content.sujet,
    content.corps,
    {
      prenom: options.contact.prenom,
      nom: options.contact.nom,
      email: options.contact.email ?? "",
      telephone: options.contact.telephone ?? "",
    },
    cgp,
    content.agenda_link_id ?? options.principal.agenda_link_id,
    content.variables ?? options.principal.variables,
    corpsHtml ? canonicalizeTemplateCorpsHtml(corpsHtml) : null,
    {
      templateNom: options.principal.nom,
      registre,
      extraVariables: { ...rdvVars, ...checklistVars },
      forSend: true,
    }
  );

  const attachmentVariables = pickTemplateVariablesForRegistre(
    options.principal.variables,
    options.tutoiement?.variables,
    registre,
    options.tutoiement != null
  );

  await sendEmail({
    to_email: options.contact.email!.trim(),
    to_name: `${options.contact.prenom} ${options.contact.nom}`.trim(),
    subject: preview.subject,
    body: preview.body,
    body_html: preview.body_html,
    attachments: buildSendEmailAttachmentsFromTemplate(attachmentVariables),
  });
}

/** Planifie rappel avant et suivi après RDV (sans envoi immédiat). */
export async function resyncPipeRdvScheduledEmails(options: {
  pipe: Pick<
    PipeRecord,
    | "id"
    | "contact_id"
    | "secondary_contact_id"
  >;
  rdvStage: PipeRdvStage;
  pipeTimelineEntryId: number;
  startAtUnix: number;
  endAtUnix: number;
  visioLink?: string | null;
  eventLocation?: string | null;
  visio?: RdvVisioOptions;
  physicalAddress?: string | null;
  notifyOnError?: boolean;
}): Promise<boolean> {
  const template = await resolvePipeRdvTemplateForStage(options.rdvStage);
  if (!template) {
    return true;
  }

  try {
    await syncPipeRdvReminderSchedules({
      pipeTimelineEntryId: options.pipeTimelineEntryId,
      pipe: options.pipe,
      template,
      startAtUnix: options.startAtUnix,
      endAtUnix: options.endAtUnix,
      visioLink: options.visioLink,
      eventLocation: options.eventLocation,
      visio: options.visio,
      physicalAddress: options.physicalAddress,
    });
    return true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("Planification emails planifiés RDV Pipe:", e);
    if (options.notifyOnError !== false) {
      toast.warning(`Emails planifiés RDV (rappel / suivi) non enregistrés : ${msg}`);
    }
    return false;
  }
}

/** Envoie le modèle Pipe RDV pour l'étape (création et replanification) + planifie le rappel. */
export async function maybeSendPipeRdvConfirmationEmail(options: {
  pipe: Pick<
    PipeRecord,
    | "id"
    | "contact_id"
    | "contact_prenom"
    | "contact_nom"
    | "secondary_contact_id"
    | "secondary_contact_prenom"
    | "secondary_contact_nom"
  >;
  rdvStage: PipeRdvStage;
  pipeTimelineEntryId: number;
  startAtUnix: number;
  endAtUnix: number;
  visioLink?: string | null;
  eventLocation?: string | null;
  visio?: RdvVisioOptions;
  physicalAddress?: string | null;
}): Promise<PipeRdvConfirmationSendResult> {
  const template = await resolvePipeRdvTemplateForStage(options.rdvStage);
  if (!template) {
    return { sent: 0, errors: [] };
  }

  await resyncPipeRdvScheduledEmails({
    pipe: options.pipe,
    rdvStage: options.rdvStage,
    pipeTimelineEntryId: options.pipeTimelineEntryId,
    startAtUnix: options.startAtUnix,
    endAtUnix: options.endAtUnix,
    visioLink: options.visioLink,
    eventLocation: options.eventLocation,
    visio: options.visio,
    physicalAddress: options.physicalAddress,
  });

  const emailStatus = await getEmailConnectionStatus();
  if (!emailStatus.connected) {
    toast.warning(
      "Email RDV Pipe non envoyé — connectez Gmail ou Outlook dans Paramètres."
    );
    return { sent: 0, errors: ["Connexion email absente"] };
  }

  const contactIds = [options.pipe.contact_id, options.pipe.secondary_contact_id].filter(
    (id): id is number => id != null && id > 0
  );
  const uniqueIds = [...new Set(contactIds)];

  let principal: TemplateEmail;
  let tutoiement: TemplateEmail | null;
  try {
    ({ principal, tutoiement } = await loadPipeRdvTemplatePair(template.id));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    toast.warning(`Email RDV Pipe : modèle introuvable (${msg})`);
    return { sent: 0, errors: [msg] };
  }

  let sent = 0;
  const errors: string[] = [];

  for (const contactId of uniqueIds) {
    let contact: Contact;
    try {
      contact = await getContactById(contactId);
    } catch {
      continue;
    }
    if (!isValidRecipientEmail(contact.email)) {
      errors.push(`${contact.prenom} ${contact.nom} : pas d'email valide`);
      continue;
    }
    try {
      await sendPipeRdvTemplatedEmailToContact({
        contact,
        pipe: options.pipe,
        principal,
        tutoiement,
        rdvStage: options.rdvStage,
        startAtUnix: options.startAtUnix,
        endAtUnix: options.endAtUnix,
        visioLink: options.visioLink,
        eventLocation: options.eventLocation,
        visio: options.visio,
        physicalAddress: options.physicalAddress,
      });
      sent += 1;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${contact.prenom} ${contact.nom} : ${msg}`);
      await logEmailSendError({
        contactId: contact.id,
        templateNom: principal.nom,
        errorMessage: msg,
        sendMode: "pipe_rdv_confirmation",
      }).catch(() => {});
    }
  }

  if (sent > 0) {
    toast.success(
      sent === 1
        ? "Email de confirmation RDV envoyé"
        : `${sent} emails de confirmation RDV envoyés`
    );
  } else if (errors.length > 0) {
    toast.warning(`Confirmation RDV non envoyée : ${errors[0]}`);
  }

  return { sent, errors };
}
