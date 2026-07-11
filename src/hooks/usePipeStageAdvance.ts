import { useCallback, useState } from "react";
import { setPipeStage, type PipeRecord } from "@/lib/api/tauri-pipe";
import { PIPE_STAGE_LABELS, type PipeStage } from "@/lib/pipe/pipe-types";
import { toast } from "sonner";

export interface PendingPipeStageAdvance {
  pipeId: number;
  targetStage: PipeStage;
  pipeTitle?: string;
  initialNotes?: string;
}

export function usePipeStageAdvance(onApplied?: (pipe: PipeRecord) => void) {
  const [pending, setPending] = useState<PendingPipeStageAdvance | null>(null);
  const [saving, setSaving] = useState(false);

  const requestStageChange = useCallback(
    (
      pipeId: number,
      targetStage: PipeStage,
      pipeTitle?: string,
      initialNotes?: string
    ) => {
      setPending({ pipeId, targetStage, pipeTitle, initialNotes });
    },
    []
  );

  const cancelStageChange = useCallback(() => {
    if (saving) return;
    setPending(null);
  }, [saving]);

  const confirmStageChange = useCallback(
    async (notes: string) => {
      if (!pending) return;
      setSaving(true);
      try {
        const trimmed = notes.trim();
        const updated = await setPipeStage(pending.pipeId, pending.targetStage, {
          notes: trimmed || null,
        });
        toast.success(`Avancement : ${PIPE_STAGE_LABELS[pending.targetStage]}`);
        setPending(null);
        onApplied?.(updated);
      } catch (err) {
        toast.error(String(err));
      } finally {
        setSaving(false);
      }
    },
    [pending, onApplied]
  );

  return {
    pending,
    saving,
    requestStageChange,
    cancelStageChange,
    confirmStageChange,
  };
}
