import type { PipeTimelineEntryRecord } from "@/lib/api/tauri-pipe-timeline";
import {
  formatTimelineEntryBadgeLabel,
  isStageMilestoneEntry,
  type PipeTimelineDisplayContext,
} from "@/lib/pipe/pipe-timeline-display";

export function compareTimelineEntriesChronologically(
  a: PipeTimelineEntryRecord,
  b: PipeTimelineEntryRecord
): number {
  return a.occurred_at - b.occurred_at || a.id - b.id;
}

/** Durées entre entrées consécutives (timeline plate, plus ancien → plus récent). */
export function buildFlatTimelineDurationLabels(
  entries: PipeTimelineEntryRecord[],
  context?: PipeTimelineDisplayContext
): Map<number, string> {
  const ordered = [...entries].sort(compareTimelineEntriesChronologically);
  const labels = new Map<number, string>();

  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    const duration = formatTimelineStepDuration(previous.occurred_at, current.occurred_at);
    if (!duration) continue;
    const previousLabel = formatTimelineEntryBadgeLabel(previous, context).toLowerCase();
    labels.set(current.id, `${duration} depuis ${previousLabel}`);
  }

  return labels;
}

export function formatTimelineStepDuration(fromTs: number, toTs: number): string | null {
  const seconds = Math.max(0, toTs - fromTs);
  if (seconds === 0) return null;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 1) return "Moins d'une minute";
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const rem = minutes % 60;
    return rem > 0 ? `${hours} h ${rem} min` : `${hours} h`;
  }

  const days = Math.floor(hours / 24);
  if (days < 14) return days === 1 ? "1 jour" : `${days} jours`;

  const weeks = Math.floor(days / 7);
  if (days < 60) return weeks === 1 ? "1 semaine" : `${weeks} semaines`;

  const months = Math.floor(days / 30);
  return months === 1 ? "1 mois" : `${months} mois`;
}

export function getMilestoneDurationLabel(
  entry: PipeTimelineEntryRecord,
  allEntries: PipeTimelineEntryRecord[],
  context?: PipeTimelineDisplayContext
): string | null {
  if (!isStageMilestoneEntry(entry.entry_type)) return null;

  const milestones = allEntries
    .filter((e) => isStageMilestoneEntry(e.entry_type))
    .sort((a, b) => a.occurred_at - b.occurred_at || a.id - b.id);

  const idx = milestones.findIndex((m) => m.id === entry.id);
  if (idx <= 0) return null;

  const previous = milestones[idx - 1];
  const duration = formatTimelineStepDuration(previous.occurred_at, entry.occurred_at);
  if (!duration) return null;

  const previousLabel = formatTimelineEntryBadgeLabel(previous, context);
  return `${duration} depuis ${previousLabel}`;
}
