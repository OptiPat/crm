import type { PipeTimelineEntryRecord } from "@/lib/api/tauri-pipe-timeline";
import { listPipeTimelineEntries } from "@/lib/api/tauri-pipe-timeline";
import { setPipeStage, type PipeRecord } from "@/lib/api/tauri-pipe";
import {
  resolveAffaireBoardColumn,
  storedStageFromBoardColumn,
  type PipeBoardColumn,
} from "@/lib/pipe/pipe-board-columns";
import {
  isRdvTimelineEntryCompleted,
  latestRdvEntryForStage,
  rdvTimelineEntryEndAtUnix,
} from "@/lib/pipe/pipe-rdv-completion";
import {
  formatRdvPlanOptionLabel,
  rdvPlanOptionFromEntryTitre,
  rdvStageFromPlanOption,
} from "@/lib/pipe/pipe-rdv-plan-option";
import { PIPE_STAGE_LABELS, type PipeStage } from "@/lib/pipe/pipe-types";

export {
  isRdvTimelineEntryCompleted,
  latestRdvEntryForStage,
  rdvTimelineEntryEndAtUnix,
};

/** Types de RDV rattachés aux étapes commerciales (extensible). */
export const PIPE_RDV_STAGE_OPTIONS = ["R1", "R2", "R3"] as const;

export type PipeRdvStage = (typeof PIPE_RDV_STAGE_OPTIONS)[number];

export function isPipeRdvStage(value: string): value is PipeRdvStage {
  return (PIPE_RDV_STAGE_OPTIONS as readonly string[]).includes(value);
}

export function rdvStageFromEntryTitre(titre: string | null | undefined): PipeRdvStage | null {
  const planOption = rdvPlanOptionFromEntryTitre(titre);
  if (planOption) return rdvStageFromPlanOption(planOption);
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
  const planOption = rdvPlanOptionFromEntryTitre(entry.titre);
  if (planOption) {
    return `${formatRdvPlanOptionLabel(planOption)} planifié`;
  }
  const titre = entry.titre?.trim();
  return titre ? `${titre} planifié` : "RDV planifié";
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

function notesAndMilestoneFromEntries(
  entries: PipeTimelineEntryRecord[],
  target: PipeStage
): { notes: string | null; milestoneOccurredAt?: number } {
  if (isPipeRdvStage(target)) {
    const latest = latestRdvEntryForStage(entries, target);
    if (latest) {
      return {
        notes: latest.contenu?.trim() || null,
        milestoneOccurredAt: latest.occurred_at,
      };
    }
  }
  const latestRdv = entries
    .filter((entry) => entry.entry_type === "RDV")
    .reduce<PipeTimelineEntryRecord | null>((best, entry) => {
      if (!best || entry.occurred_at > best.occurred_at) return entry;
      return best;
    }, null);
  return {
    notes: latestRdv?.contenu?.trim() || null,
    milestoneOccurredAt: latestRdv?.occurred_at,
  };
}

/** Rang persisté aligné sur la colonne kanban (pas le RDV le plus haut). */
export function pickDueRdvStageAdvanceTarget(
  currentStage: string,
  entries: PipeTimelineEntryRecord[]
): { stage: PipeStage; column: PipeBoardColumn } | null {
  if (currentStage === "GAGNEE" || currentStage === "PERDUE_OU_EN_ATTENTE") {
    return null;
  }
  const column = resolveAffaireBoardColumn({ stage: currentStage, pipe_type: "AFFAIRE" }, entries);
  const target = storedStageFromBoardColumn(column);
  if (target === currentStage) return null;
  return { stage: target, column };
}

export async function applyDueRdvStageAdvance(
  pipe: Pick<PipeRecord, "id" | "stage" | "pipe_type">,
  entries: PipeTimelineEntryRecord[]
): Promise<PipeRecord | null> {
  if (pipe.pipe_type !== "AFFAIRE") return null;

  const target = pickDueRdvStageAdvanceTarget(pipe.stage, entries);
  if (!target) return null;

  const { notes, milestoneOccurredAt } = notesAndMilestoneFromEntries(entries, target.stage);
  return setPipeStage(pipe.id, target.stage, {
    notes,
    milestoneOccurredAt,
  });
}

export async function applyRdvStageOnSave(options: {
  pipe: Pick<PipeRecord, "id" | "stage" | "pipe_type">;
  rdvStage: PipeRdvStage;
  occurredAt: number;
  notes?: string | null;
  entries?: PipeTimelineEntryRecord[];
}): Promise<{
  advanced: boolean;
  boardColumn?: PipeBoardColumn;
  scheduledDateLabel?: string;
}> {
  if (options.pipe.pipe_type !== "AFFAIRE") {
    return { advanced: false };
  }

  const entries =
    options.entries ?? (await listPipeTimelineEntries(options.pipe.id));
  const column = resolveAffaireBoardColumn(options.pipe, entries);
  const target = storedStageFromBoardColumn(column);
  const scheduledDateLabel = isRdvStageAdvanceDue(options.occurredAt)
    ? undefined
    : formatRdvScheduledAdvanceDate(options.occurredAt);

  if (target === options.pipe.stage) {
    return { advanced: false, boardColumn: column, scheduledDateLabel };
  }

  await setPipeStage(options.pipe.id, target, {
    notes: options.notes?.trim() || null,
    milestoneOccurredAt: options.occurredAt,
  });
  return {
    advanced: true,
    boardColumn: column,
    scheduledDateLabel,
  };
}
