import type { PipeTimelineEntryRecord } from "@/lib/api/tauri-pipe-timeline";
import {
  isPipeTimelineSystemEntry,
  timelineStageFromEntry,
  type PipeTimelineDisplayContext,
} from "@/lib/pipe/pipe-timeline-display";
import {
  PIPE_TIMELINE_USER_TYPES,
  type PipeTimelineUserType,
} from "@/lib/pipe/pipe-timeline-types";
import type { PipeStage } from "@/lib/pipe/pipe-types";

const USER_TYPES = new Set<string>(PIPE_TIMELINE_USER_TYPES);

export interface StageMilestoneRef {
  entry: PipeTimelineEntryRecord;
  stage: PipeStage;
}

function compareTimelineEntries(
  a: PipeTimelineEntryRecord,
  b: PipeTimelineEntryRecord
): number {
  return a.occurred_at - b.occurred_at || a.id - b.id;
}

/** Jalons d'étape (Prospection, R1, R2…) triés chronologiquement. */
export function getOrderedStageMilestones(
  entries: PipeTimelineEntryRecord[],
  context?: PipeTimelineDisplayContext
): StageMilestoneRef[] {
  if (context?.pipeType !== "AFFAIRE") return [];

  return entries
    .filter((e) => e.entry_type === "CREATION" || e.entry_type === "AVANCEMENT")
    .map((entry) => {
      const stage = timelineStageFromEntry(entry, context);
      return stage ? { entry, stage } : null;
    })
    .filter((m): m is StageMilestoneRef => m != null)
    .sort((a, b) => compareTimelineEntries(a.entry, b.entry));
}

export function getPhaseUserEntriesForMilestone(
  milestone: PipeTimelineEntryRecord,
  milestones: StageMilestoneRef[],
  entries: PipeTimelineEntryRecord[]
): PipeTimelineEntryRecord[] {
  const index = milestones.findIndex((m) => m.entry.id === milestone.id);
  if (index < 0) return [];

  const startAt = milestone.occurred_at;
  const endAt = milestones[index + 1]?.entry.occurred_at ?? null;

  return entries
    .filter((e) => {
      if (isPipeTimelineSystemEntry(e.entry_type)) return false;
      if (!USER_TYPES.has(e.entry_type)) return false;
      if (e.occurred_at < startAt) return false;
      if (endAt != null && e.occurred_at >= endAt) return false;
      return true;
    })
    .sort(compareTimelineEntries);
}

export function getAllStagePhaseUserEntryIds(
  entries: PipeTimelineEntryRecord[],
  context?: PipeTimelineDisplayContext
): Set<number> {
  const milestones = getOrderedStageMilestones(entries, context);
  const ids = new Set<number>();
  for (const { entry } of milestones) {
    for (const phaseEntry of getPhaseUserEntriesForMilestone(entry, milestones, entries)) {
      ids.add(phaseEntry.id);
    }
  }
  return ids;
}

export function isStagePhaseUserEntry(
  entry: PipeTimelineEntryRecord,
  entries: PipeTimelineEntryRecord[],
  context?: PipeTimelineDisplayContext
): boolean {
  return getAllStagePhaseUserEntryIds(entries, context).has(entry.id);
}

export function summarizePhaseEntries(entries: PipeTimelineEntryRecord[]): string | null {
  if (entries.length === 0) return null;

  const counts = entries.reduce(
    (acc, e) => {
      if (USER_TYPES.has(e.entry_type)) {
        acc[e.entry_type as PipeTimelineUserType] =
          (acc[e.entry_type as PipeTimelineUserType] ?? 0) + 1;
      }
      return acc;
    },
    {} as Partial<Record<PipeTimelineUserType, number>>
  );

  const parts: string[] = [];
  if (counts.APPEL) {
    parts.push(counts.APPEL === 1 ? "1 appel" : `${counts.APPEL} appels`);
  }
  if (counts.RDV) {
    parts.push(counts.RDV === 1 ? "1 RDV" : `${counts.RDV} RDV`);
  }
  if (counts.NOTE) {
    parts.push(counts.NOTE === 1 ? "1 note" : `${counts.NOTE} notes`);
  }
  if (counts.PROPOSITION) {
    parts.push(
      counts.PROPOSITION === 1 ? "1 proposition" : `${counts.PROPOSITION} propositions`
    );
  }

  return parts.length > 0 ? parts.join(", ") : null;
}
