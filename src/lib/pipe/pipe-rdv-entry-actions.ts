import type { PipeRecord } from "@/lib/api/tauri-pipe";
import type { usePipeTimeline } from "@/hooks/usePipeTimeline";
import { PIPE_STAGE_LABELS } from "@/lib/pipe/pipe-types";
import type { PipeTimelineUserType } from "@/lib/pipe/pipe-timeline-types";
import type { RdvVisioOptions } from "@/lib/calendar/rdv-visio";
import { sendPipeRdvConfirmationAfterCalendar, syncGoogleCalendarForPipeRdv } from "@/lib/calendar/rdv-planifier";
import type { PipeRdvCalendarSyncResult } from "@/lib/pipe/pipe-rdv-google-calendar";
import { formatPipeRdvCalendarContactLabel, pipeRdvCalendarEndAt } from "@/lib/pipe/pipe-rdv-google-calendar";
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
  rdvPlanOption?: PipeRdvPlanOption;
  titre: string;
  contenu: string | null;
  occurredAtUnix: number;
  endAtUnix?: number;
  visio?: RdvVisioOptions;
  physicalAddress?: string | null;
}): Promise<PipeRdvStageSaveResult | null> {
  const planOption =
    options.rdvPlanOption ??
    (options.rdvStage ? defaultPlanOptionForRdvStage(options.rdvStage) : null);
  const rdvStage = planOption ? rdvStageFromPlanOption(planOption) : options.rdvStage;
  const titre =
    options.entryType === "RDV" && planOption
      ? rdvEntryTitreFromPlanOption(planOption)
      : options.titre;

  const entry = await options.timeline.addEntry({
    entry_type: options.entryType,
    titre,
    contenu: options.contenu,
    occurred_at: options.occurredAtUnix,
  });

  if (options.entryType !== "RDV" || !rdvStage || !options.pipe) {
    return null;
  }

  const endAtUnix = options.endAtUnix ?? pipeRdvCalendarEndAt(options.occurredAtUnix);

  const calendarPromise = options.calendar
    ? syncGoogleCalendarForPipeRdv({
        contactId: options.calendar.contactId,
        contactLabel: options.calendar.contactLabel,
        rdvStage,
        rdvPlanOption: planOption ?? undefined,
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
      rdvStage,
      occurredAt: options.occurredAtUnix,
      notes: options.contenu,
    }),
    calendarPromise,
  ]);

  if (options.pipe) {
    await sendPipeRdvConfirmationAfterCalendar({
      pipe: options.pipe,
      rdvStage,
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

export type PipeSuiviRdvSaveResult = {
  calendar?: PipeRdvCalendarSyncResult;
};

export async function addPipeSuiviRdvEntry(options: {
  timeline: ReturnType<typeof usePipeTimeline>;
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
  >;
  occurredAtUnix: number;
  contenu: string | null;
  endAtUnix?: number;
  visio?: RdvVisioOptions;
  physicalAddress?: string | null;
}): Promise<PipeSuiviRdvSaveResult> {
  const entry = await options.timeline.addEntry({
    entry_type: "RDV",
    titre: SUIVI_RDV_TITRE,
    contenu: options.contenu,
    occurred_at: options.occurredAtUnix,
  });

  const endAtUnix = options.endAtUnix ?? pipeRdvCalendarEndAt(options.occurredAtUnix);
  const contactLabel = formatPipeRdvCalendarContactLabel(options.pipe);

  const calendar = await syncGoogleCalendarForPipeRdv({
    contactId: options.pipe.contact_id,
    contactLabel,
    /** Requis par l'API ; le titre agenda réel passe par calendarTitle. */
    rdvStage: "R1",
    startAtUnix: options.occurredAtUnix,
    endAtUnix,
    pipeTimelineEntryId: entry.id,
    calendarTitle: formatPipeSuiviRdvGoogleCalendarTitle(contactLabel),
    visio: options.visio,
    physicalAddress: options.physicalAddress,
    additionalAttendeeContactIds:
      options.pipe.secondary_contact_id != null && options.pipe.secondary_contact_id > 0
        ? [options.pipe.secondary_contact_id]
        : undefined,
  });

  return { calendar };
}

export function toastAfterSuiviRdvSave(calendar?: PipeRdvCalendarSyncResult): void {
  const level = calendarToastLevel(calendar);
  toastPipeRdvOutcome("RDV de suivi enregistré", calendar, level);
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
