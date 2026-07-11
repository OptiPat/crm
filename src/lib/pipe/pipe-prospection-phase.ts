import type { PipeTimelineEntryRecord } from "@/lib/api/tauri-pipe-timeline";
import {
  isPipeTimelineSystemEntry,
  PIPE_TIMELINE_PROSPECTION_STAGE,
  timelineStageFromEntry,
  type PipeTimelineDisplayContext,
} from "@/lib/pipe/pipe-timeline-display";
import {
  PIPE_TIMELINE_USER_TYPES,
  type PipeTimelineUserType,
} from "@/lib/pipe/pipe-timeline-types";

const USER_TYPES = new Set<string>(PIPE_TIMELINE_USER_TYPES);

export function isProspectionMilestoneEntry(
  entry: Pick<PipeTimelineEntryRecord, "entry_type" | "titre">,
  context?: PipeTimelineDisplayContext
): boolean {
  return (
    timelineStageFromEntry(entry, context) === PIPE_TIMELINE_PROSPECTION_STAGE
  );
}

function compareTimelineEntries(
  a: PipeTimelineEntryRecord,
  b: PipeTimelineEntryRecord
): number {
  return a.occurred_at - b.occurred_at || a.id - b.id;
}

/** Premier jalon AVANCEMENT chronologique (fin de la phase prospection). */
export function getFirstAvancementMilestone(
  entries: PipeTimelineEntryRecord[]
): PipeTimelineEntryRecord | null {
  return (
    entries
      .filter((e) => e.entry_type === "AVANCEMENT")
      .sort(compareTimelineEntries)[0] ?? null
  );
}

export function getProspectionCreationMilestone(
  entries: PipeTimelineEntryRecord[],
  context?: PipeTimelineDisplayContext
): PipeTimelineEntryRecord | null {
  return (
    entries.find((e) => isProspectionMilestoneEntry(e, context)) ?? null
  );
}

/** Entrées utilisateur (appel, RDV…) survenues pendant la phase prospection. */
export function getProspectionPhaseUserEntries(
  entries: PipeTimelineEntryRecord[],
  context?: PipeTimelineDisplayContext
): PipeTimelineEntryRecord[] {
  const creation = getProspectionCreationMilestone(entries, context);
  if (!creation || context?.pipeType !== "AFFAIRE") return [];

  const firstAvancement = getFirstAvancementMilestone(entries);
  const endAt = firstAvancement?.occurred_at ?? null;

  return entries
    .filter((e) => {
      if (isPipeTimelineSystemEntry(e.entry_type)) return false;
      if (!USER_TYPES.has(e.entry_type)) return false;
      if (e.occurred_at < creation.occurred_at) return false;
      if (endAt != null && e.occurred_at >= endAt) return false;
      return true;
    })
    .sort(compareTimelineEntries);
}

export function isProspectionPhaseUserEntry(
  entry: PipeTimelineEntryRecord,
  entries: PipeTimelineEntryRecord[],
  context?: PipeTimelineDisplayContext
): boolean {
  if (context?.pipeType !== "AFFAIRE") return false;
  const phaseIds = new Set(
    getProspectionPhaseUserEntries(entries, context).map((e) => e.id)
  );
  return phaseIds.has(entry.id);
}

export function summarizeProspectionPhaseEntries(
  entries: PipeTimelineEntryRecord[]
): string | null {
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
      counts.PROPOSITION === 1
        ? "1 proposition"
        : `${counts.PROPOSITION} propositions`
    );
  }

  return parts.length > 0 ? parts.join(", ") : null;
}
