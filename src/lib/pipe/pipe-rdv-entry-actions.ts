import type { PipeRecord } from "@/lib/api/tauri-pipe";
import type { usePipeTimeline } from "@/hooks/usePipeTimeline";
import { PIPE_STAGE_LABELS } from "@/lib/pipe/pipe-types";
import type { PipeTimelineUserType } from "@/lib/pipe/pipe-timeline-types";
import type { RdvVisioOptions } from "@/lib/calendar/rdv-visio";
import { syncGoogleCalendarForPipeRdv } from "@/lib/calendar/rdv-planifier";
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

export async function addPipeTimelineEntryWithRdvStage(options: {
  timeline: ReturnType<typeof usePipeTimeline>;
  pipe?: Pick<PipeRecord, "id" | "stage" | "pipe_type"> | null;
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

  return { ...stageResult, calendar };
}

export function notifyGoogleCalendarSync(calendar?: PipeRdvCalendarSyncResult): void {
  if (!calendar) return;
  if (calendar.synced) {
    toast.success("RDV planifié dans Google Agenda");
    return;
  }
  if (calendar.reason === "past") {
    toast.warning(
      "RDV enregistré dans le Pipe, mais pas dans Google Agenda : choisissez une date/heure future."
    );
    return;
  }
  if (calendar.reason === "not_connected") {
    toast.warning(
      "RDV enregistré dans le Pipe — connectez Google Agenda dans Paramètres pour synchroniser."
    );
    return;
  }
  if (calendar.reason === "error") {
    toast.warning(
      calendar.message.includes("connexion") || calendar.message.includes("Connectez")
        ? calendar.message
        : `Google Agenda : ${calendar.message}`
    );
  }
}

export function toastAfterPipeRdvReschedule(
  calendar?: PipeRdvCalendarSyncResult
): void {
  if (calendar?.synced) {
    toast.success("RDV décalé — Pipe et Google Agenda mis à jour");
    return;
  }
  toast.success("RDV décalé dans le Pipe");
  notifyGoogleCalendarSync(calendar);
}

export function toastAfterRdvSave(
  rdvStage: PipeRdvStage,
  result: PipeRdvStageSaveResult | null,
  fallbackSuccess = "RDV ajouté"
) {
  if (!result) {
    toast.success(fallbackSuccess);
    return;
  }
  if (result.advanced) {
    toast.success(`RDV enregistré — avancement : ${PIPE_STAGE_LABELS[rdvStage]}`);
    notifyGoogleCalendarSync(result.calendar);
    return;
  }
  if (result.scheduledDateLabel) {
    toast.success(
      `RDV planifié. Passage en ${PIPE_STAGE_LABELS[rdvStage]} le ${result.scheduledDateLabel}.`
    );
    notifyGoogleCalendarSync(result.calendar);
    return;
  }
  toast.success(fallbackSuccess);
  notifyGoogleCalendarSync(result.calendar);
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
