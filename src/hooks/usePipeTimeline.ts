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
import { subscribePipeChanged } from "@/lib/pipe/pipe-events";
import { toast } from "sonner";

export function usePipeTimeline(pipeId: number) {
  const [entries, setEntries] = useState<PipeTimelineEntryRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
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
      await reload();
      return entry;
    },
    [pipeId, reload]
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
