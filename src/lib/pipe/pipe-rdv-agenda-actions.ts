import { getPipeById, type PipeRecord } from "@/lib/api/tauri-pipe";
import {
  createPipeTimelineEntry,
  deletePipeTimelineEntry,
  getPipeTimelineEntry,
  updatePipeTimelineEntry,
  type PipeTimelineEntryRecord,
} from "@/lib/api/tauri-pipe-timeline";
import type { PipeRdvCalendarSyncResult } from "@/lib/pipe/pipe-rdv-google-calendar";
import {
  formatPipeRdvCalendarContactLabel,
  formatPipeRdvGoogleCalendarTitleFromPlanOption,
  pipeRdvCalendarEndAt,
} from "@/lib/pipe/pipe-rdv-google-calendar";
import { rdvStageFromEntryTitre, type PipeRdvStage } from "@/lib/pipe/pipe-rdv-stage";
import {
  defaultPlanOptionForRdvStage,
  rdvPlanOptionFromEntryTitre,
} from "@/lib/pipe/pipe-rdv-plan-option";
import {
  executePipeRdvReschedule,
  executePipeSuiviRdvReschedule,
} from "@/lib/pipe/pipe-rdv-reschedule-actions";
import { executeRdvCancellation } from "@/lib/pipe/pipe-rdv-delete-actions";
import {
  formatSuiviRdvDisplayLabel,
  isSuiviRdvEntry,
} from "@/lib/pipe/pipe-suivi";
import { PIPE_STAGE_LABELS, type PipeStage } from "@/lib/pipe/pipe-types";
import { notifyPipeChanged } from "@/lib/pipe/pipe-events";

export async function loadAgendaPipeRdvContext(
  pipeId: number,
  timelineEntryId: number
): Promise<{ pipe: PipeRecord; entry: PipeTimelineEntryRecord }> {
  const [pipe, entry] = await Promise.all([
    getPipeById(pipeId),
    getPipeTimelineEntry(timelineEntryId),
  ]);
  return { pipe, entry };
}

export async function reschedulePipeRdvFromAgenda(options: {
  pipe: Pick<
    PipeRecord,
    "id" | "stage" | "pipe_type" | "contact_id" | "contact_prenom" | "contact_nom" | "titre"
  >;
  entry: PipeTimelineEntryRecord;
  rdvStage: PipeRdvStage;
  startAtUnix: number;
  endAtUnix: number;
  calendarTitle: string;
}): Promise<PipeRdvCalendarSyncResult | undefined> {
  const contactLabel = formatPipeRdvCalendarContactLabel(options.pipe);

  if (isSuiviRdvEntry(options.entry)) {
    const calendar = await executePipeSuiviRdvReschedule({
      entry: options.entry,
      pipe: options.pipe,
      newOccurredAtUnix: options.startAtUnix,
      endAtUnix: options.endAtUnix,
      updateEntry: (id, input) => updatePipeTimelineEntry(id, input),
      addEntry: (input) =>
        createPipeTimelineEntry({ ...input, pipe_id: options.entry.pipe_id }),
    });
    notifyPipeChanged();
    return calendar;
  }

  const rdvPlanOption =
    rdvPlanOptionFromEntryTitre(options.entry.titre) ??
    defaultPlanOptionForRdvStage(options.rdvStage);
  const calendarTitle =
    options.calendarTitle ??
    formatPipeRdvGoogleCalendarTitleFromPlanOption(rdvPlanOption, contactLabel);

  const calendar = await executePipeRdvReschedule({
    entry: options.entry,
    pipe: options.pipe,
    rdvStage: options.rdvStage,
    rdvPlanOption,
    newOccurredAtUnix: options.startAtUnix,
    endAtUnix: options.endAtUnix,
    calendarTitle,
    updateEntry: (id, input) => updatePipeTimelineEntry(id, input),
    addEntry: (input) =>
      createPipeTimelineEntry({ ...input, pipe_id: options.entry.pipe_id }),
  });

  notifyPipeChanged();
  return calendar;
}

export async function cancelPipeRdvFromAgenda(options: {
  pipe?: Pick<PipeRecord, "id" | "stage" | "pipe_type"> | null;
  entry: PipeTimelineEntryRecord;
  note?: string | null;
  cancelGoogle: boolean;
}): Promise<{ revertedStage: PipeStage | null; googleCancelled: boolean; rdvLabel: string }> {
  const rdvStage = rdvStageFromEntryTitre(options.entry.titre);
  const rdvLabel = isSuiviRdvEntry(options.entry)
    ? formatSuiviRdvDisplayLabel()
    : rdvStage
      ? `RDV ${PIPE_STAGE_LABELS[rdvStage]}`
      : "RDV";

  const result = await executeRdvCancellation({
    pipe: options.pipe,
    entry: options.entry,
    note: options.note,
    cancelGoogle: options.cancelGoogle,
    addEntry: (input) =>
      createPipeTimelineEntry({ ...input, pipe_id: options.entry.pipe_id }),
    removeEntry: deletePipeTimelineEntry,
  });

  notifyPipeChanged();
  return { ...result, rdvLabel };
}

export function pipeRdvEndAtFromDuration(startAtUnix: number, durationMin: number): number {
  return startAtUnix + durationMin * 60;
}

export function pipeRdvDurationMinutes(startAtUnix: number, endAtUnix: number): number {
  return Math.max(15, Math.round((endAtUnix - startAtUnix) / 60));
}

export { pipeRdvCalendarEndAt };
