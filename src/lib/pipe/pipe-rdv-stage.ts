import type { PipeTimelineEntryRecord } from "@/lib/api/tauri-pipe-timeline";
import { setPipeStage, type PipeRecord } from "@/lib/api/tauri-pipe";
import { PIPE_RDV_CALENDAR_DURATION_SEC } from "@/lib/pipe/pipe-rdv-google-calendar";
import {
  isPipeStage,
  PIPE_LINEAR_STAGES,
  PIPE_STAGE_LABELS,
  type PipeStage,
} from "@/lib/pipe/pipe-types";

/** Types de RDV rattachés aux étapes commerciales (extensible). */
export const PIPE_RDV_STAGE_OPTIONS = ["R1", "R2", "R3"] as const;

export type PipeRdvStage = (typeof PIPE_RDV_STAGE_OPTIONS)[number];

export function isPipeRdvStage(value: string): value is PipeRdvStage {
  return (PIPE_RDV_STAGE_OPTIONS as readonly string[]).includes(value);
}

export function rdvStageFromEntryTitre(titre: string | null | undefined): PipeRdvStage | null {
  const raw = titre?.trim() ?? "";
  if (isPipeRdvStage(raw)) return raw;
  return null;
}

export function formatRdvStageLabel(stage: PipeRdvStage): string {
  return PIPE_STAGE_LABELS[stage];
}

export function formatRdvEntryTitle(stage: PipeRdvStage): string {
  return stage;
}

export function formatRdvEntryDisplayLabel(
  entry: Pick<PipeTimelineEntryRecord, "entry_type" | "titre">
): string | null {
  if (entry.entry_type !== "RDV") return null;
  const stage = rdvStageFromEntryTitre(entry.titre);
  if (stage) return `${formatRdvStageLabel(stage)} planifié`;
  const titre = entry.titre?.trim();
  return titre ? `${titre} planifié` : "RDV planifié";
}

function linearStageIndex(stage: string): number {
  if (!isPipeStage(stage)) return -1;
  return PIPE_LINEAR_STAGES.indexOf(stage as (typeof PIPE_LINEAR_STAGES)[number]);
}

/** Jour calendaire local (00:00) à partir d'un timestamp unix. */
export function localDayStartFromUnix(ts: number): number {
  const d = new Date(ts * 1000);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function isRdvStageAdvanceDue(
  occurredAtUnix: number,
  now: Date = new Date()
): boolean {
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return localDayStartFromUnix(occurredAtUnix) <= todayStart;
}

export function rdvTimelineEntryEndAtUnix(occurredAtUnix: number): number {
  return occurredAtUnix + PIPE_RDV_CALENDAR_DURATION_SEC;
}

/** RDV commercial terminé (fin de créneau agenda, durée par défaut 1 h). */
export function isRdvTimelineEntryCompleted(
  entry: Pick<PipeTimelineEntryRecord, "entry_type" | "titre" | "occurred_at">,
  now: Date = new Date()
): boolean {
  if (entry.entry_type !== "RDV") return false;
  if (!rdvStageFromEntryTitre(entry.titre)) return false;
  const nowUnix = Math.floor(now.getTime() / 1000);
  return rdvTimelineEntryEndAtUnix(entry.occurred_at) <= nowUnix;
}

export function latestRdvEntryForStage(
  entries: PipeTimelineEntryRecord[],
  rdvStage: PipeRdvStage
): PipeTimelineEntryRecord | null {
  let best: PipeTimelineEntryRecord | null = null;
  for (const entry of entries) {
    if (entry.entry_type !== "RDV") continue;
    if (rdvStageFromEntryTitre(entry.titre) !== rdvStage) continue;
    if (!best || entry.occurred_at > best.occurred_at) best = entry;
  }
  return best;
}

/** Étape R1/R2/R3 considérée comme faite dans le stepper (dernier RDV de l'étape terminé). */
export function isPipeRdvStageCompleted(
  rdvStage: PipeRdvStage,
  entries: PipeTimelineEntryRecord[],
  now: Date = new Date()
): boolean {
  const latest = latestRdvEntryForStage(entries, rdvStage);
  if (!latest) return false;
  return isRdvTimelineEntryCompleted(latest, now);
}

export function formatRdvScheduledAdvanceDate(occurredAtUnix: number): string {
  return new Date(occurredAtUnix * 1000).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function pickDueRdvStageAdvanceTarget(
  currentStage: string,
  entries: PipeTimelineEntryRecord[],
  now: Date = new Date()
): { stage: PipeRdvStage; entry: PipeTimelineEntryRecord } | null {
  const currentIdx = linearStageIndex(currentStage);
  if (currentIdx < 0) return null;

  let best: { stage: PipeRdvStage; entry: PipeTimelineEntryRecord; idx: number } | null =
    null;

  for (const entry of entries) {
    if (entry.entry_type !== "RDV") continue;
    const rdvStage = rdvStageFromEntryTitre(entry.titre);
    if (!rdvStage) continue;
    if (!isRdvStageAdvanceDue(entry.occurred_at, now)) continue;

    const targetIdx = linearStageIndex(rdvStage);
    if (targetIdx <= currentIdx) continue;

    if (!best || targetIdx > best.idx) {
      best = { stage: rdvStage, entry, idx: targetIdx };
    }
  }

  return best ? { stage: best.stage, entry: best.entry } : null;
}

export async function applyDueRdvStageAdvance(
  pipe: Pick<PipeRecord, "id" | "stage" | "pipe_type">,
  entries: PipeTimelineEntryRecord[]
): Promise<PipeRecord | null> {
  if (pipe.pipe_type !== "AFFAIRE") return null;

  const target = pickDueRdvStageAdvanceTarget(pipe.stage, entries);
  if (!target) return null;

  const notes = target.entry.contenu?.trim() || null;
  return setPipeStage(pipe.id, target.stage as PipeStage, {
    notes,
    milestoneOccurredAt: target.entry.occurred_at,
  });
}

export async function applyRdvStageOnSave(options: {
  pipe: Pick<PipeRecord, "id" | "stage" | "pipe_type">;
  rdvStage: PipeRdvStage;
  occurredAt: number;
  notes?: string | null;
}): Promise<{ advanced: boolean; scheduledDateLabel?: string }> {
  if (options.pipe.pipe_type !== "AFFAIRE") {
    return { advanced: false };
  }

  if (!isRdvStageAdvanceDue(options.occurredAt)) {
    return {
      advanced: false,
      scheduledDateLabel: formatRdvScheduledAdvanceDate(options.occurredAt),
    };
  }

  const currentIdx = linearStageIndex(options.pipe.stage);
  const targetIdx = linearStageIndex(options.rdvStage);
  if (currentIdx < 0 || targetIdx <= currentIdx) {
    return { advanced: false };
  }

  await setPipeStage(options.pipe.id, options.rdvStage, {
    notes: options.notes?.trim() || null,
    milestoneOccurredAt: options.occurredAt,
  });
  return { advanced: true };
}
