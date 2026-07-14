import type { PipeTimelineEntryRecord } from "@/lib/api/tauri-pipe-timeline";
import { isSuiviRdvEntry } from "@/lib/pipe/pipe-suivi";
import { formatTimelineStepDuration } from "@/lib/pipe/pipe-timeline-duration";

export interface SuiviTimelineAnchor {
  entry: PipeTimelineEntryRecord;
  label: string;
}

function compareTimelineEntries(
  a: PipeTimelineEntryRecord,
  b: PipeTimelineEntryRecord
): number {
  return a.occurred_at - b.occurred_at || a.id - b.id;
}

function suiviAnchorLabel(entry: PipeTimelineEntryRecord): string {
  if (entry.entry_type === "CREATION") return "création du suivi";
  if (entry.entry_type === "RDV" && isSuiviRdvEntry(entry)) return "RDV de suivi";
  const titre = entry.titre?.trim();
  return titre ? `envoi Stellium (${titre})` : "envoi Stellium";
}

/** Jalons suivi : création, RDV de suivi, envois Stellium confirmés (liés à une opération). */
export function getSuiviTimelineAnchors(
  entries: PipeTimelineEntryRecord[],
  placementTimelineEntryIds: ReadonlySet<number>
): SuiviTimelineAnchor[] {
  const anchors: SuiviTimelineAnchor[] = [];

  for (const entry of entries) {
    if (entry.entry_type === "CREATION") {
      anchors.push({ entry, label: suiviAnchorLabel(entry) });
      continue;
    }
    if (entry.entry_type === "RDV" && isSuiviRdvEntry(entry)) {
      anchors.push({ entry, label: suiviAnchorLabel(entry) });
      continue;
    }
    if (placementTimelineEntryIds.has(entry.id)) {
      anchors.push({ entry, label: suiviAnchorLabel(entry) });
    }
  }

  return anchors.sort((a, b) => compareTimelineEntries(a.entry, b.entry));
}

export function getSuiviDurationLabel(
  entry: PipeTimelineEntryRecord,
  anchors: SuiviTimelineAnchor[]
): string | null {
  const idx = anchors.findIndex((anchor) => anchor.entry.id === entry.id);
  if (idx <= 0) return null;

  const previous = anchors[idx - 1];
  const duration = formatTimelineStepDuration(
    previous.entry.occurred_at,
    entry.occurred_at
  );
  if (!duration) return null;

  return `${duration} depuis ${previous.label}`;
}
