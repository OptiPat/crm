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
import { rdvStageFromEntryTitre } from "@/lib/pipe/pipe-rdv-stage";
import { parseRdvTimelineTraceNote } from "@/lib/pipe/pipe-rdv-delete";
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

/**
 * Un jalon affiché par étape (Prospection = premier jalon, R1/R2/R3 = dernier avancement).
 * Évite les doublons Prospection + retour prospection dans l'historique.
 */
export function getCanonicalStageMilestones(
  entries: PipeTimelineEntryRecord[],
  context?: PipeTimelineDisplayContext
): StageMilestoneRef[] {
  const ordered = getOrderedStageMilestones(entries, context);
  const prospection = ordered.find((m) => m.stage === "PROSPECTION");
  const latestByStage = new Map<PipeStage, StageMilestoneRef>();

  for (const milestone of ordered) {
    if (milestone.stage === "PROSPECTION") continue;
    latestByStage.set(milestone.stage, milestone);
  }

  const canonical: StageMilestoneRef[] = [];
  if (prospection) canonical.push(prospection);
  for (const milestone of ordered) {
    if (milestone.stage === "PROSPECTION") continue;
    const latest = latestByStage.get(milestone.stage);
    if (latest?.entry.id === milestone.entry.id) {
      canonical.push(milestone);
    }
  }

  return canonical.sort((a, b) => compareTimelineEntries(a.entry, b.entry));
}

export function resolveUserEntryMilestoneId(
  entry: PipeTimelineEntryRecord,
  milestones: StageMilestoneRef[],
  _entries: PipeTimelineEntryRecord[] = []
): number | null {
  if (isPipeTimelineSystemEntry(entry.entry_type) || !USER_TYPES.has(entry.entry_type)) {
    return null;
  }

  if (entry.entry_type === "RDV") {
    const rdvStage = rdvStageFromEntryTitre(entry.titre);
    if (rdvStage) {
      const stageMilestone = [...milestones].reverse().find((m) => m.stage === rdvStage);
      if (stageMilestone) return stageMilestone.entry.id;
    }
  }

  const trace = parseRdvTimelineTraceNote(entry.contenu);
  if (trace) {
    return null;
  }

  for (let index = milestones.length - 1; index >= 0; index -= 1) {
    const startAt = milestones[index].entry.occurred_at;
    const endAt = milestones[index + 1]?.entry.occurred_at ?? null;
    if (entry.occurred_at < startAt) continue;
    if (endAt != null && entry.occurred_at >= endAt) continue;
    return milestones[index].entry.id;
  }

  return null;
}

export function getPhaseUserEntriesForMilestone(
  milestone: PipeTimelineEntryRecord,
  milestones: StageMilestoneRef[],
  entries: PipeTimelineEntryRecord[]
): PipeTimelineEntryRecord[] {
  if (milestones.findIndex((m) => m.entry.id === milestone.id) < 0) return [];

  return entries
    .filter((e) => resolveUserEntryMilestoneId(e, milestones, entries) === milestone.id)
    .sort(compareTimelineEntries);
}

export function getAllStagePhaseUserEntryIds(
  entries: PipeTimelineEntryRecord[],
  context?: PipeTimelineDisplayContext
): Set<number> {
  const milestones = getCanonicalStageMilestones(entries, context);
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

/** Jalon PROSPECTION AVANCEMENT créé au retour prospection — déjà couvert par CREATION. */
export function isHiddenStageMilestoneEntry(
  entry: PipeTimelineEntryRecord,
  entries: PipeTimelineEntryRecord[],
  context?: PipeTimelineDisplayContext
): boolean {
  if (entry.entry_type !== "AVANCEMENT") return false;
  const stage = timelineStageFromEntry(entry, context);
  if (stage !== "PROSPECTION" || context?.pipeType !== "AFFAIRE") return false;
  return entries.some(
    (candidate) =>
      candidate.entry_type === "CREATION" &&
      timelineStageFromEntry(candidate, context) === "PROSPECTION"
  );
}

export function getVisiblePipeTimelineEntries(
  entries: PipeTimelineEntryRecord[],
  context?: PipeTimelineDisplayContext
): PipeTimelineEntryRecord[] {
  return entries.filter(
    (entry) => !isHiddenStageMilestoneEntry(entry, entries, context)
  );
}
