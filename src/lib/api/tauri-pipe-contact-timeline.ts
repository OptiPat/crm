import { invoke } from "@tauri-apps/api/core";

export interface PipeContactTimelineEntry {
  id: number;
  pipe_id: number;
  entry_type: string;
  titre?: string | null;
  contenu?: string | null;
  occurred_at: number;
  created_at: number;
  google_event_id?: string | null;
  pipe_titre: string;
  pipe_type: string;
  pipe_stage: string;
  pipe_archived_at?: number | null;
}

export async function listPipeTimelineForContact(
  contactId: number
): Promise<PipeContactTimelineEntry[]> {
  return invoke<PipeContactTimelineEntry[]>("list_pipe_timeline_for_contact", {
    contactId,
  });
}
