import {
  cancelCalendarRdv,
  createCalendarRdv,
  updateCalendarRdv,
} from "@/lib/api/tauri-calendar";
import { createPipeTimelineEntry } from "@/lib/api/tauri-pipe-timeline";
import type { PipeRecord } from "@/lib/api/tauri-pipe";
import { getEmailConnectionStatus } from "@/lib/api/tauri-email-oauth";
import {
  formatPipeRdvCalendarContactLabel,
  formatPipeRdvGoogleCalendarTitle,
  formatPipeRdvGoogleCalendarTitleFromPlanOption,
  isPipeRdvCalendarSyncEligible,
  type PipeRdvCalendarSyncResult,
} from "@/lib/pipe/pipe-rdv-google-calendar";
import {
  formatPipeSuiviRdvGoogleCalendarTitle,
  SUIVI_RDV_TITRE,
} from "@/lib/pipe/pipe-suivi";
import {
  applyRdvStageOnSave,
  type PipeRdvStage,
} from "@/lib/pipe/pipe-rdv-stage";
import {
  defaultPlanOptionForRdvStage,
  rdvEntryTitreFromPlanOption,
  rdvStageFromPlanOption,
  type PipeRdvPlanOption,
} from "@/lib/pipe/pipe-rdv-plan-option";
import type { RdvVisioOptions } from "@/lib/calendar/rdv-visio";
import { loadDefaultPipeRdvVisio, rdvVisioToApiPayload } from "@/lib/calendar/rdv-visio";
import { runRelationAutoSync } from "@/lib/emails/relation-auto-sync";
import { buildPipeRdvCalendarContext, warnPipeRdvMissingAttendeeEmails } from "@/lib/pipe/pipe-rdv-calendar-context";
import { maybeSendPipeRdvConfirmationEmail } from "@/lib/pipe/pipe-rdv-confirmation-email";

export async function sendPipeRdvConfirmationAfterCalendar(options: {
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
  calendar?: PipeRdvCalendarSyncResult;
  startAtUnix: number;
  endAtUnix: number;
  visio?: RdvVisioOptions;
  physicalAddress?: string | null;
}): Promise<void> {
  await maybeSendPipeRdvConfirmationEmail({
    pipe: options.pipe,
    rdvStage: options.rdvStage,
    pipeTimelineEntryId: options.pipeTimelineEntryId,
    startAtUnix: options.startAtUnix,
    endAtUnix: options.endAtUnix,
    visioLink: options.calendar?.synced ? options.calendar.visioLink : undefined,
    eventLocation: options.calendar?.synced ? options.calendar.eventLocation : undefined,
    visio: options.visio,
    physicalAddress: options.physicalAddress,
  });
}

export async function syncGoogleCalendarForPipeRdv(options: {
  contactId: number;
  contactLabel: string;
  rdvStage: PipeRdvStage;
  rdvPlanOption?: PipeRdvPlanOption;
  startAtUnix: number;
  endAtUnix: number;
  pipeTimelineEntryId?: number | null;
  existingGoogleEventId?: string | null;
  visio?: RdvVisioOptions;
  physicalAddress?: string | null;
  calendarTitle?: string | null;
  additionalAttendeeContactIds?: number[];
}): Promise<PipeRdvCalendarSyncResult> {
  if (options.contactId <= 0) {
    return { synced: false, reason: "no_contact" };
  }

  let calendarConnected = false;
  try {
    const status = await getEmailConnectionStatus();
    calendarConnected = status.google_calendar_connected;
  } catch {
    return { synced: false, reason: "not_connected" };
  }

  if (!calendarConnected) {
    return { synced: false, reason: "not_connected" };
  }

  if (!isPipeRdvCalendarSyncEligible(options.startAtUnix)) {
    return { synced: false, reason: "past" };
  }

  const title =
    options.calendarTitle?.trim() ||
    (options.rdvPlanOption
      ? formatPipeRdvGoogleCalendarTitleFromPlanOption(
          options.rdvPlanOption,
          options.contactLabel
        )
      : formatPipeRdvGoogleCalendarTitle(options.rdvStage, options.contactLabel));
  const preserveVisio = options.existingGoogleEventId != null && options.visio === undefined;
  const visio = options.visio ?? (preserveVisio ? undefined : await loadDefaultPipeRdvVisio());
  const visioPayload =
    visio != null
      ? rdvVisioToApiPayload(visio, options.physicalAddress)
      : { addGoogleMeet: false, visioLink: null as string | null, eventLocation: null as string | null };

  try {
    let visioLink: string | null = null;
    let eventLocation: string | null = null;
    if (options.existingGoogleEventId) {
      const details = await updateCalendarRdv({
        googleEventId: options.existingGoogleEventId,
        title,
        startAt: options.startAtUnix,
        endAt: options.endAtUnix,
        preserveVisio,
        clearVisio: visio?.mode === "none",
        addGoogleMeet: visioPayload.addGoogleMeet,
        visioLink: visioPayload.visioLink,
        eventLocation: visioPayload.eventLocation,
        additionalAttendeeContactIds: options.additionalAttendeeContactIds,
      });
      visioLink = details.visio_link ?? null;
      eventLocation = details.event_location ?? null;
    } else {
      const created = await createCalendarRdv({
        contactId: options.contactId,
        pipeTimelineEntryId: options.pipeTimelineEntryId ?? null,
        title,
        startAt: options.startAtUnix,
        endAt: options.endAtUnix,
        addGoogleMeet: visioPayload.addGoogleMeet,
        visioLink: visioPayload.visioLink,
        eventLocation: visioPayload.eventLocation,
        additionalAttendeeContactIds: options.additionalAttendeeContactIds,
      });
      visioLink = created.visio_link ?? null;
      eventLocation = created.event_location ?? null;
    }
    return { synced: true, clientAlreadyAccepted: false, visioLink, eventLocation };
  } catch (e) {
    return {
      synced: false,
      reason: "error",
      message: e instanceof Error ? e.message : String(e),
    };
  }

}

export async function planifyPipeRdv(options: {
  pipe: Pick<
    PipeRecord,
    | "id"
    | "stage"
    | "pipe_type"
    | "contact_id"
    | "contact_prenom"
    | "contact_nom"
    | "secondary_contact_id"
    | "secondary_contact_prenom"
    | "secondary_contact_nom"
    | "titre"
  >;
  rdvStage: PipeRdvStage;
  rdvPlanOption?: PipeRdvPlanOption;
  startAtUnix: number;
  endAtUnix: number;
  contenu?: string | null;
  alerteId?: number | null;
  tacheId?: number | null;
  visio?: RdvVisioOptions;
  physicalAddress?: string | null;
  calendarTitle?: string | null;
}): Promise<{ calendar?: PipeRdvCalendarSyncResult }> {
  const planOption =
    options.rdvPlanOption ?? defaultPlanOptionForRdvStage(options.rdvStage);
  const rdvStage = rdvStageFromPlanOption(planOption);
  const contactLabel = formatPipeRdvCalendarContactLabel(options.pipe);
  const calendarCtx = buildPipeRdvCalendarContext(options.pipe);

  await warnPipeRdvMissingAttendeeEmails(options.pipe);

  const entry = await createPipeTimelineEntry({
    pipe_id: options.pipe.id,
    entry_type: "RDV",
    titre: rdvEntryTitreFromPlanOption(planOption),
    contenu: options.contenu?.trim() || null,
    occurred_at: options.startAtUnix,
  });

  const [, calendar] = await Promise.all([
    applyRdvStageOnSave({
      pipe: options.pipe,
      rdvStage,
      occurredAt: options.startAtUnix,
      notes: options.contenu?.trim() || null,
    }),
    syncGoogleCalendarForPipeRdv({
      contactId: options.pipe.contact_id,
      contactLabel,
      rdvStage,
      rdvPlanOption: planOption,
      startAtUnix: options.startAtUnix,
      endAtUnix: options.endAtUnix,
      pipeTimelineEntryId: entry.id,
      visio: options.visio,
      physicalAddress: options.physicalAddress,
      calendarTitle: options.calendarTitle,
      additionalAttendeeContactIds: calendarCtx?.additionalAttendeeContactIds,
    }),
  ]);

  await sendPipeRdvConfirmationAfterCalendar({
    pipe: options.pipe,
    rdvStage,
    pipeTimelineEntryId: entry.id,
    calendar,
    startAtUnix: options.startAtUnix,
    endAtUnix: options.endAtUnix,
    visio: options.visio,
    physicalAddress: options.physicalAddress,
  });

  return { calendar };
}

export async function planifyPipeSuiviRdv(options: {
  pipe: Pick<
    PipeRecord,
    | "id"
    | "stage"
    | "pipe_type"
    | "contact_id"
    | "contact_prenom"
    | "contact_nom"
    | "secondary_contact_id"
    | "secondary_contact_prenom"
    | "secondary_contact_nom"
    | "titre"
  >;
  startAtUnix: number;
  endAtUnix: number;
  contenu?: string | null;
  visio?: RdvVisioOptions;
  physicalAddress?: string | null;
  calendarTitle?: string | null;
}): Promise<{ calendar?: PipeRdvCalendarSyncResult }> {
  const contactLabel = formatPipeRdvCalendarContactLabel(options.pipe);
  const calendarCtx = buildPipeRdvCalendarContext(options.pipe);

  await warnPipeRdvMissingAttendeeEmails(options.pipe);

  const entry = await createPipeTimelineEntry({
    pipe_id: options.pipe.id,
    entry_type: "RDV",
    titre: SUIVI_RDV_TITRE,
    contenu: options.contenu?.trim() || null,
    occurred_at: options.startAtUnix,
  });

  const calendar = await syncGoogleCalendarForPipeRdv({
    contactId: options.pipe.contact_id,
    contactLabel,
    rdvStage: "R1",
    startAtUnix: options.startAtUnix,
    endAtUnix: options.endAtUnix,
    pipeTimelineEntryId: entry.id,
    visio: options.visio,
    physicalAddress: options.physicalAddress,
    calendarTitle:
      options.calendarTitle?.trim() || formatPipeSuiviRdvGoogleCalendarTitle(contactLabel),
    additionalAttendeeContactIds: calendarCtx?.additionalAttendeeContactIds,
  });

  return { calendar };
}

export async function planifyStandaloneGoogleRdv(options: {
  contactId: number;
  contactLabel: string;
  title: string;
  startAtUnix: number;
  endAtUnix: number;
  alerteId?: number | null;
  tacheId?: number | null;
  visio?: RdvVisioOptions;
  physicalAddress?: string | null;
}): Promise<void> {
  const visioPayload = rdvVisioToApiPayload(
    options.visio ?? { mode: "none" },
    options.physicalAddress
  );
  await createCalendarRdv({
    contactId: options.contactId,
    alerteId: options.alerteId,
    tacheId: options.tacheId,
    title: options.title.trim() || `RDV — ${options.contactLabel}`,
    startAt: options.startAtUnix,
    endAt: options.endAtUnix,
    addGoogleMeet: visioPayload.addGoogleMeet,
    visioLink: visioPayload.visioLink,
    eventLocation: visioPayload.eventLocation,
  });

  try {
    await runRelationAutoSync();
  } catch {
    /* sync statut RDV / pipeline — best effort */
  }
}

export async function cancelLinkedGoogleRdv(googleEventId: string | null | undefined): Promise<void> {
  if (!googleEventId?.trim()) return;
  try {
    const status = await getEmailConnectionStatus();
    if (!status.google_calendar_connected) return;
    await cancelCalendarRdv(googleEventId);
  } catch {
    /* best effort */
  }
}
