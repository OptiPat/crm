import type { PipeRecord } from "@/lib/api/tauri-pipe";
import type {
  NewPipeTimelineEntryInput,
  PipeTimelineEntryRecord,
} from "@/lib/api/tauri-pipe-timeline";
import type { usePipeTimeline } from "@/hooks/usePipeTimeline";
import type { RdvVisioOptions } from "@/lib/calendar/rdv-visio";
import { sendPipeRdvConfirmationAfterCalendar, syncGoogleCalendarForPipeRdv } from "@/lib/calendar/rdv-planifier";
import { getPipeRdvCalendarEventForTimeline } from "@/lib/api/tauri-calendar";
import type { PipeRdvCalendarSyncResult } from "@/lib/pipe/pipe-rdv-google-calendar";
import { resolvePipeRdvGoogleEventId } from "@/lib/api/tauri-calendar";
import { buildPipeRdvCalendarContext, warnPipeRdvMissingAttendeeEmails } from "@/lib/pipe/pipe-rdv-calendar-context";
import { pipeRdvCalendarEndAt, formatPipeRdvCalendarContactLabel } from "@/lib/pipe/pipe-rdv-google-calendar";
import { resyncPipeRdvScheduledEmails } from "@/lib/pipe/pipe-rdv-confirmation-email";
import { buildRdvRescheduledTimelinePayload } from "@/lib/pipe/pipe-rdv-delete";
import {
  applyRdvStageOnSave,
  formatRdvEntryTitle,
  type PipeRdvStage,
} from "@/lib/pipe/pipe-rdv-stage";
import {
  formatPipeSuiviRdvGoogleCalendarTitle,
  SUIVI_RDV_TITRE,
} from "@/lib/pipe/pipe-suivi";
import type { UpdatePipeTimelineEntryInput } from "@/lib/api/tauri-pipe-timeline";

type TimelineEntryWriter = (
  input: Omit<NewPipeTimelineEntryInput, "pipe_id">
) => Promise<PipeTimelineEntryRecord>;

type TimelineEntryUpdater = (
  id: number,
  input: UpdatePipeTimelineEntryInput
) => Promise<PipeTimelineEntryRecord>;

export async function executePipeRdvReschedule(options: {
  entry: PipeTimelineEntryRecord;
  pipe: Pick<
    PipeRecord,
    "id" | "stage" | "pipe_type" | "contact_id" | "contact_prenom" | "contact_nom"
  > &
    Partial<
      Pick<
        PipeRecord,
        "secondary_contact_id" | "secondary_contact_prenom" | "secondary_contact_nom" | "titre"
      >
    >;
  rdvStage: PipeRdvStage;
  newOccurredAtUnix: number;
  endAtUnix?: number;
  contenu?: string | null;
  calendarTitle?: string | null;
  userNote?: string | null;
  visio?: RdvVisioOptions;
  physicalAddress?: string | null;
  updateEntry: TimelineEntryUpdater;
  addEntry: TimelineEntryWriter;
}): Promise<PipeRdvCalendarSyncResult | undefined> {
  const previousOccurredAt = options.entry.occurred_at;
  const dateChanged = previousOccurredAt !== options.newOccurredAtUnix;
  const endAtUnix = options.endAtUnix ?? pipeRdvCalendarEndAt(options.newOccurredAtUnix);
  const calendarSnapshot = await getPipeRdvCalendarEventForTimeline(options.entry.id).catch(
    () => null
  );
  const previousEndAtUnix =
    calendarSnapshot?.end_at ?? pipeRdvCalendarEndAt(previousOccurredAt);
  const endChanged = endAtUnix !== previousEndAtUnix;
  const nextContenu =
    options.contenu !== undefined
      ? options.contenu?.trim() || null
      : options.entry.contenu?.trim() || null;

  const calendarCtx = buildPipeRdvCalendarContext(options.pipe);

  await warnPipeRdvMissingAttendeeEmails(options.pipe);

  await options.updateEntry(options.entry.id, {
    titre: formatRdvEntryTitle(options.rdvStage),
    contenu: nextContenu,
    occurred_at: options.newOccurredAtUnix,
  });

  if (dateChanged) {
    const { titre, contenu } = buildRdvRescheduledTimelinePayload(
      options.entry,
      previousOccurredAt,
      options.newOccurredAtUnix,
      options.userNote
    );
    await options.addEntry({
      entry_type: "NOTE",
      titre,
      contenu,
      occurred_at: Math.floor(Date.now() / 1000),
    });
  }

  const [, calendar] = await Promise.all([
    applyRdvStageOnSave({
      pipe: options.pipe,
      rdvStage: options.rdvStage,
      occurredAt: options.newOccurredAtUnix,
      notes: nextContenu,
    }),
    syncGoogleCalendarForPipeRdv({
      contactId: options.pipe.contact_id,
      contactLabel: formatPipeRdvCalendarContactLabel(options.pipe),
      rdvStage: options.rdvStage,
      startAtUnix: options.newOccurredAtUnix,
      endAtUnix,
      pipeTimelineEntryId: options.entry.id,
      existingGoogleEventId:
        options.entry.google_event_id?.trim() ||
        (await resolvePipeRdvGoogleEventId(options.entry.id)),
      calendarTitle: options.calendarTitle,
      additionalAttendeeContactIds: calendarCtx?.additionalAttendeeContactIds,
    }),
  ]);

  if (dateChanged) {
    await sendPipeRdvConfirmationAfterCalendar({
      pipe: options.pipe,
      rdvStage: options.rdvStage,
      pipeTimelineEntryId: options.entry.id,
      calendar,
      startAtUnix: options.newOccurredAtUnix,
      endAtUnix,
      visio: options.visio,
      physicalAddress: options.physicalAddress,
    });
  } else if (endChanged) {
    await resyncPipeRdvScheduledEmails({
      pipe: options.pipe,
      rdvStage: options.rdvStage,
      pipeTimelineEntryId: options.entry.id,
      startAtUnix: options.newOccurredAtUnix,
      endAtUnix,
      visioLink: calendar?.synced ? calendar.visioLink : undefined,
      eventLocation: calendar?.synced ? calendar.eventLocation : undefined,
      visio: options.visio,
      physicalAddress: options.physicalAddress,
    });
  }

  return calendar;
}

export async function executePipeSuiviRdvReschedule(options: {
  entry: PipeTimelineEntryRecord;
  pipe: Pick<
    PipeRecord,
    "id" | "stage" | "pipe_type" | "contact_id" | "contact_prenom" | "contact_nom"
  > &
    Partial<
      Pick<
        PipeRecord,
        "secondary_contact_id" | "secondary_contact_prenom" | "secondary_contact_nom" | "titre"
      >
    >;
  newOccurredAtUnix: number;
  endAtUnix?: number;
  contenu?: string | null;
  userNote?: string | null;
  updateEntry: TimelineEntryUpdater;
  addEntry: TimelineEntryWriter;
}): Promise<PipeRdvCalendarSyncResult | undefined> {
  const previousOccurredAt = options.entry.occurred_at;
  const dateChanged = previousOccurredAt !== options.newOccurredAtUnix;
  const endAtUnix = options.endAtUnix ?? pipeRdvCalendarEndAt(options.newOccurredAtUnix);
  const nextContenu =
    options.contenu !== undefined
      ? options.contenu?.trim() || null
      : options.entry.contenu?.trim() || null;

  const calendarCtx = buildPipeRdvCalendarContext(options.pipe);
  const contactLabel = formatPipeRdvCalendarContactLabel(options.pipe);

  await warnPipeRdvMissingAttendeeEmails(options.pipe);

  await options.updateEntry(options.entry.id, {
    titre: SUIVI_RDV_TITRE,
    contenu: nextContenu,
    occurred_at: options.newOccurredAtUnix,
  });

  if (dateChanged) {
    const { titre, contenu } = buildRdvRescheduledTimelinePayload(
      { entry_type: "RDV", titre: SUIVI_RDV_TITRE },
      previousOccurredAt,
      options.newOccurredAtUnix,
      options.userNote
    );
    await options.addEntry({
      entry_type: "NOTE",
      titre,
      contenu,
      occurred_at: Math.floor(Date.now() / 1000),
    });
  }

  return syncGoogleCalendarForPipeRdv({
    contactId: options.pipe.contact_id,
    contactLabel,
    rdvStage: "R1",
    startAtUnix: options.newOccurredAtUnix,
    endAtUnix,
    pipeTimelineEntryId: options.entry.id,
    existingGoogleEventId:
      options.entry.google_event_id?.trim() ||
      (await resolvePipeRdvGoogleEventId(options.entry.id)),
    calendarTitle: formatPipeSuiviRdvGoogleCalendarTitle(contactLabel),
    additionalAttendeeContactIds: calendarCtx?.additionalAttendeeContactIds,
  });
}

export async function applyPipeSuiviRdvReschedule(options: {
  timeline: ReturnType<typeof usePipeTimeline>;
  entry: PipeTimelineEntryRecord;
  pipe: Pick<
    PipeRecord,
    "id" | "stage" | "pipe_type" | "contact_id" | "contact_prenom" | "contact_nom"
  > &
    Partial<
      Pick<
        PipeRecord,
        "secondary_contact_id" | "secondary_contact_prenom" | "secondary_contact_nom" | "titre"
      >
    >;
  newOccurredAtUnix: number;
  endAtUnix?: number;
  contenu?: string | null;
  userNote?: string | null;
}): Promise<PipeRdvCalendarSyncResult | undefined> {
  return executePipeSuiviRdvReschedule({
    ...options,
    updateEntry: (id, input) => options.timeline.updateEntry(id, input),
    addEntry: (input) => options.timeline.addEntry(input),
  });
}

export async function applyPipeRdvReschedule(options: {
  timeline: ReturnType<typeof usePipeTimeline>;
  entry: PipeTimelineEntryRecord;
  pipe: Pick<
    PipeRecord,
    "id" | "stage" | "pipe_type" | "contact_id" | "contact_prenom" | "contact_nom"
  > &
    Partial<
      Pick<
        PipeRecord,
        "secondary_contact_id" | "secondary_contact_prenom" | "secondary_contact_nom" | "titre"
      >
    >;
  rdvStage: PipeRdvStage;
  newOccurredAtUnix: number;
  endAtUnix?: number;
  contenu?: string | null;
  calendarTitle?: string | null;
  userNote?: string | null;
}): Promise<PipeRdvCalendarSyncResult | undefined> {
  return executePipeRdvReschedule({
    ...options,
    updateEntry: (id, input) => options.timeline.updateEntry(id, input),
    addEntry: (input) => options.timeline.addEntry(input),
  });
}
