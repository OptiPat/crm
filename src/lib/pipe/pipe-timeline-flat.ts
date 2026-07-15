import type { PipeTimelineEntryRecord } from "@/lib/api/tauri-pipe-timeline";
import { isRdvTimelineTraceNote } from "@/lib/pipe/pipe-rdv-delete";
import { isPipeTimelineSystemEntry } from "@/lib/pipe/pipe-timeline-display";
import { isPipeTimelineUserType } from "@/lib/pipe/pipe-timeline-types";

/** Appel, RDV, note… affichés comme points de la timeline (hors jalons système). */
export function isFlatTimelineUserEntry(entry: PipeTimelineEntryRecord): boolean {
  if (isPipeTimelineSystemEntry(entry.entry_type)) return false;
  if (isRdvTimelineTraceNote(entry)) return false;
  return isPipeTimelineUserType(entry.entry_type);
}
