import { invoke } from "@tauri-apps/api/core";
import { notifyPipeChanged } from "@/lib/pipe/pipe-events";
import type { PipeTimelineUserType } from "@/lib/pipe/pipe-timeline-types";

export interface PipeTimelineEntryRecord {
  id: number;
  pipe_id: number;
  entry_type: string;
  titre?: string | null;
  contenu?: string | null;
  occurred_at: number;
  created_at: number;
}

export interface NewPipeTimelineEntryInput {
  pipe_id: number;
  entry_type: PipeTimelineUserType;
  titre?: string | null;
  contenu?: string | null;
  occurred_at?: number | null;
}

export async function listPipeTimelineEntries(
  pipeId: number
): Promise<PipeTimelineEntryRecord[]> {
  return invoke<PipeTimelineEntryRecord[]>("list_pipe_timeline_entries", { pipeId });
}

export async function createPipeTimelineEntry(
  input: NewPipeTimelineEntryInput
): Promise<PipeTimelineEntryRecord> {
  const entry = await invoke<PipeTimelineEntryRecord>("create_pipe_timeline_entry", {
    entry: input,
  });
  notifyPipeChanged();
  return entry;
}

export async function deletePipeTimelineEntry(id: number): Promise<void> {
  await invoke<void>("delete_pipe_timeline_entry", { id });
  notifyPipeChanged();
}
