import type { PipeRecord } from "@/lib/api/tauri-pipe";
import type { usePipeTimeline } from "@/hooks/usePipeTimeline";
import { PIPE_STAGE_LABELS } from "@/lib/pipe/pipe-types";
import type { PipeTimelineUserType } from "@/lib/pipe/pipe-timeline-types";
import type { RdvVisioOptions } from "@/lib/calendar/rdv-visio";
import { sendPipeRdvConfirmationAfterCalendar, syncGoogleCalendarForPipeRdv } from "@/lib/calendar/rdv-planifier";
import type { PipeRdvCalendarSyncResult } from "@/lib/pipe/pipe-rdv-google-calendar";
import { formatPipeRdvCalendarContactLabel, pipeRdvCalendarEndAt } from "@/lib/pipe/pipe-rdv-google-calendar";
import {
  applyRdvStageOnSave,
  formatRdvEntryTitle,
  type PipeRdvStage,
} from "@/lib/pipe/pipe-rdv-stage";
import { toast } from "sonner";

export type PipeRdvStageSaveResult = {
  advanced: boolean;
  scheduledDateLabel?: string;
  calendar?: PipeRdvCalendarSyncResult;
};

/** Ligne complémentaire Agenda Google (sans toast). */
export function describeGoogleCalendarSyncLine(
  calendar?: PipeRdvCalendarSyncResult
): string | null {
  if (!calendar) return null;
  if (calendar.synced) return "Synchronisé avec Google Agenda.";
  if (calendar.reason === "past") {
    return "Non ajouté à Google Agenda : choisissez une date/heure future.";
  }
  if (calendar.reason === "not_connected") {
    return "Google Agenda non connecté (Paramètres).";
  }
  if (calendar.reason === "no_contact") {
    return "Google Agenda : contact introuvable.";
  }
  if (calendar.reason === "error") {
    return calendar.message.includes("connexion") || calendar.message.includes("Connectez")
      ? calendar.message
      : `Google Agenda : ${calendar.message}`;
  }
  return null;
}

const PIPE_RDV_TOAST_ID = "pipe-rdv-outcome";

function calendarToastLevel(
  calendar?: PipeRdvCalendarSyncResult
): "success" | "warning" {
  return calendar && !calendar.synced ? "warning" : "success";
}

/** Un seul toast Pipe à la fois (remplace le précédent au lieu de s'empiler). */
export function toastPipeRdvOutcome(
  primary: string,
  calendar?: PipeRdvCalendarSyncResult,
  level: "success" | "warning" = "success"
): void {
  const detail = describeGoogleCalendarSyncLine(calendar);
  const message = detail ? `${primary} ${detail}` : primary;
  const options = { id: PIPE_RDV_TOAST_ID };
  if (level === "warning") {
    toast.warning(message, options);
  } else {
    toast.success(message, options);
  }
}

export async function addPipeTimelineEntryWithRdvStage(options: {
  timeline: ReturnType<typeof usePipeTimeline>;
  pipe?: Pick<
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
  > | null;
  calendar?: {
    contactId: number;
    contactLabel: string;
    additionalAttendeeContactIds?: number[];
  };
  entryType: PipeTimelineUserType;
  rdvStage?: PipeRdvStage;
  titre: string;
  contenu: string | null;
  occurredAtUnix: number;
  endAtUnix?: number;
  visio?: RdvVisioOptions;
  physicalAddress?: string | null;
}): Promise<PipeRdvStageSaveResult | null> {
  const titre =
    options.entryType === "RDV" && options.rdvStage
      ? formatRdvEntryTitle(options.rdvStage)
      : options.titre;

  const entry = await options.timeline.addEntry({
    entry_type: options.entryType,
    titre,
    contenu: options.contenu,
    occurred_at: options.occurredAtUnix,
  });

  if (options.entryType !== "RDV" || !options.rdvStage || !options.pipe) {
    return null;
  }

  const endAtUnix = options.endAtUnix ?? pipeRdvCalendarEndAt(options.occurredAtUnix);

  const calendarPromise = options.calendar
    ? syncGoogleCalendarForPipeRdv({
        contactId: options.calendar.contactId,
        contactLabel: options.calendar.contactLabel,
        rdvStage: options.rdvStage,
        startAtUnix: options.occurredAtUnix,
        endAtUnix,
        pipeTimelineEntryId: entry.id,
        visio: options.visio,
        physicalAddress: options.physicalAddress,
        additionalAttendeeContactIds: options.calendar?.additionalAttendeeContactIds,
      })
    : Promise.resolve(undefined);

  const [stageResult, calendar] = await Promise.all([
    applyRdvStageOnSave({
      pipe: options.pipe,
      rdvStage: options.rdvStage,
      occurredAt: options.occurredAtUnix,
      notes: options.contenu,
    }),
    calendarPromise,
  ]);

  if (options.pipe) {
    await sendPipeRdvConfirmationAfterCalendar({
      pipe: options.pipe,
      rdvStage: options.rdvStage,
      pipeTimelineEntryId: entry.id,
      calendar,
      startAtUnix: options.occurredAtUnix,
      endAtUnix,
      visio: options.visio,
      physicalAddress: options.physicalAddress,
    });
  }

  return { ...stageResult, calendar };
}

export function toastAfterPipeRdvReschedule(
  calendar?: PipeRdvCalendarSyncResult
): void {
  if (calendar?.synced) {
    toastPipeRdvOutcome("RDV décalé — Pipe et Google Agenda mis à jour.");
    return;
  }
  toastPipeRdvOutcome(
    "RDV décalé dans le Pipe.",
    calendar,
    calendarToastLevel(calendar)
  );
}

export function toastAfterRdvSave(
  rdvStage: PipeRdvStage,
  result: PipeRdvStageSaveResult | null,
  fallbackSuccess = "RDV ajouté"
) {
  if (!result) {
    toast.success(fallbackSuccess, { id: PIPE_RDV_TOAST_ID });
    return;
  }
  const level = calendarToastLevel(result.calendar);

  if (result.advanced) {
    toastPipeRdvOutcome(
      `RDV enregistré — avancement : ${PIPE_STAGE_LABELS[rdvStage]}.`,
      result.calendar,
      level
    );
    return;
  }
  if (result.scheduledDateLabel) {
    toastPipeRdvOutcome(
      `RDV planifié. Passage en ${PIPE_STAGE_LABELS[rdvStage]} le ${result.scheduledDateLabel}.`,
      result.calendar,
      level
    );
    return;
  }
  toastPipeRdvOutcome(fallbackSuccess, result.calendar, level);
}

export async function updatePipeRdvWithGoogleSync(options: {
  entry: { id: number; google_event_id?: string | null };
  pipe: Pick<
    PipeRecord,
    "id" | "stage" | "pipe_type" | "contact_id" | "contact_prenom" | "contact_nom" | "titre"
  >;
  rdvStage: PipeRdvStage;
  occurredAtUnix: number;
  endAtUnix?: number;
  contenu?: string | null;
  calendarTitle?: string | null;
}): Promise<PipeRdvCalendarSyncResult | undefined> {
  const endAtUnix = options.endAtUnix ?? pipeRdvCalendarEndAt(options.occurredAtUnix);
  return syncGoogleCalendarForPipeRdv({
    contactId: options.pipe.contact_id,
    contactLabel: formatPipeRdvCalendarContactLabel(options.pipe),
    rdvStage: options.rdvStage,
    startAtUnix: options.occurredAtUnix,
    endAtUnix,
    pipeTimelineEntryId: options.entry.id,
    existingGoogleEventId: options.entry.google_event_id,
    calendarTitle: options.calendarTitle,
  });
}
