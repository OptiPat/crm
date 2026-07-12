import { useCallback, useEffect, useState } from "react";
import {
  createPipeTimelineEntry,
  deletePipeTimelineEntry,
  listPipeTimelineEntries,
  updatePipeTimelineEntry,
  updatePipeTimelineMilestoneNotes,
  type NewPipeTimelineEntryInput,
  type PipeTimelineEntryRecord,
  type UpdatePipeTimelineEntryInput,
} from "@/lib/api/tauri-pipe-timeline";
import { syncPipeGoogleRdvs } from "@/lib/api/tauri-calendar";
import { getEmailConnectionStatus } from "@/lib/api/tauri-email-oauth";
import { handlePipeGoogleAgendaSyncResult } from "@/lib/pipe/pipe-rdv-google-sync-reminders";
import { subscribePipeChanged, notifyPipeChanged } from "@/lib/pipe/pipe-events";
import { toast } from "sonner";

function mergeTimelineEntry(
  entries: PipeTimelineEntryRecord[],
  entry: PipeTimelineEntryRecord
): PipeTimelineEntryRecord[] {
  const next = [...entries.filter((e) => e.id !== entry.id), entry];
  next.sort((a, b) => b.occurred_at - a.occurred_at || b.id - a.id);
  return next;
}

export function usePipeTimeline(pipeId: number) {
  const [entries, setEntries] = useState<PipeTimelineEntryRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      try {
        const status = await getEmailConnectionStatus();
        if (status.google_calendar_connected) {
          const sync = await syncPipeGoogleRdvs();
          await handlePipeGoogleAgendaSyncResult(sync);
          if (sync.cancelled > 0 || sync.rescheduled > 0) {
            notifyPipeChanged();
          }
        }
      } catch {
        /* sync Google best effort */
      }
      const rows = await listPipeTimelineEntries(pipeId);
      setEntries(rows);
    } catch (err) {
      toast.error(String(err));
    } finally {
      setLoading(false);
    }
  }, [pipeId]);

  useEffect(() => {
    setLoading(true);
    void reload();
    return subscribePipeChanged(() => {
      void reload();
    });
  }, [reload]);

  const addEntry = useCallback(
    async (input: Omit<NewPipeTimelineEntryInput, "pipe_id">) => {
      const entry = await createPipeTimelineEntry({ ...input, pipe_id: pipeId });
      setEntries((prev) => mergeTimelineEntry(prev, entry));
      setLoading(false);
      return entry;
    },
    [pipeId]
  );

  const removeEntry = useCallback(
    async (id: number) => {
      await deletePipeTimelineEntry(id);
      await reload();
    },
    [reload]
  );

  const updateMilestoneNotes = useCallback(
    async (id: number, contenu: string | null) => {
      const entry = await updatePipeTimelineMilestoneNotes(id, contenu);
      await reload();
      return entry;
    },
    [reload]
  );

  const updateEntry = useCallback(
    async (id: number, input: UpdatePipeTimelineEntryInput) => {
      const entry = await updatePipeTimelineEntry(id, input);
      await reload();
      return entry;
    },
    [reload]
  );

  return {
    entries,
    loading,
    reload,
    addEntry,
    removeEntry,
    updateMilestoneNotes,
    updateEntry,
  };
}
