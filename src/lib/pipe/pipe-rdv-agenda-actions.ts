import { getPipeById, setPipeStage, type PipeRecord } from "@/lib/api/tauri-pipe";
import {
  createPipeTimelineEntry,
  deletePipeTimelineEntry,
  getPipeTimelineEntry,
  updatePipeTimelineEntry,
  type PipeTimelineEntryRecord,
} from "@/lib/api/tauri-pipe-timeline";
import { cancelLinkedGoogleRdv } from "@/lib/calendar/rdv-planifier";
import { notifyGoogleCalendarSync, updatePipeRdvWithGoogleSync } from "@/lib/pipe/pipe-rdv-entry-actions";
import { pipeRdvCalendarEndAt, formatPipeRdvCalendarContactLabel, formatPipeRdvGoogleCalendarTitle } from "@/lib/pipe/pipe-rdv-google-calendar";
import {
  applyRdvStageOnSave,
  formatRdvEntryTitle,
  rdvStageFromEntryTitre,
  type PipeRdvStage,
} from "@/lib/pipe/pipe-rdv-stage";
import {
  buildRdvCancelledTimelinePayload,
  canRevertPipeToProspection,
} from "@/lib/pipe/pipe-rdv-delete";
import { PIPE_STAGE_LABELS } from "@/lib/pipe/pipe-types";
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
}): Promise<void> {
  const calendarTitle = formatPipeRdvGoogleCalendarTitle(
    options.rdvStage,
    formatPipeRdvCalendarContactLabel(options.pipe)
  );

  await updatePipeTimelineEntry(options.entry.id, {
    titre: formatRdvEntryTitle(options.rdvStage),
    contenu: options.entry.contenu ?? null,
    occurred_at: options.startAtUnix,
  });

  const [, calendar] = await Promise.all([
    applyRdvStageOnSave({
      pipe: options.pipe,
      rdvStage: options.rdvStage,
      occurredAt: options.startAtUnix,
      notes: options.entry.contenu?.trim() || null,
    }),
    updatePipeRdvWithGoogleSync({
      entry: options.entry,
      pipe: options.pipe,
      rdvStage: options.rdvStage,
      occurredAtUnix: options.startAtUnix,
      endAtUnix: options.endAtUnix,
      calendarTitle: options.calendarTitle ?? calendarTitle,
    }),
  ]);

  notifyGoogleCalendarSync(calendar);
  notifyPipeChanged();
}

export async function cancelPipeRdvFromAgenda(options: {
  pipe?: Pick<PipeRecord, "id" | "stage" | "pipe_type"> | null;
  entry: PipeTimelineEntryRecord;
  note?: string | null;
  cancelGoogle: boolean;
}): Promise<{ revertedToProspection: boolean; rdvLabel: string }> {
  if (options.cancelGoogle && options.entry.google_event_id?.trim()) {
    await cancelLinkedGoogleRdv(options.entry.google_event_id);
  }

  const { titre, contenu } = buildRdvCancelledTimelinePayload(options.entry, options.note);
  const now = Math.floor(Date.now() / 1000);
  const rdvStage = rdvStageFromEntryTitre(options.entry.titre);
  const rdvLabel = rdvStage ? `RDV ${PIPE_STAGE_LABELS[rdvStage]}` : "RDV";

  await createPipeTimelineEntry({
    pipe_id: options.entry.pipe_id,
    entry_type: "NOTE",
    titre,
    contenu,
    occurred_at: now,
  });
  await deletePipeTimelineEntry(options.entry.id);

  let revertedToProspection = false;
  const pipe = options.pipe;
  if (
    pipe?.pipe_type === "AFFAIRE" &&
    pipe.stage !== "PROSPECTION" &&
    canRevertPipeToProspection(pipe.stage)
  ) {
    await setPipeStage(pipe.id, "PROSPECTION", { notes: null });
    revertedToProspection = true;
  }

  notifyPipeChanged();
  return { revertedToProspection, rdvLabel };
}

export function pipeRdvEndAtFromDuration(startAtUnix: number, durationMin: number): number {
  return startAtUnix + durationMin * 60;
}

export function pipeRdvDurationMinutes(startAtUnix: number, endAtUnix: number): number {
  return Math.max(15, Math.round((endAtUnix - startAtUnix) / 60));
}

export { pipeRdvCalendarEndAt };
