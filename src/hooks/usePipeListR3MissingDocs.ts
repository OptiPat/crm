import { useCallback, useEffect, useState } from "react";
import { listPipeR3MissingDocsSummaries } from "@/lib/api/tauri-pipe-r3-checklist";
import {
  mapPipeChecklistKeysToLabels,
  subscribePipeChecklistTemplatesChanged,
  type PipeChecklistTemplates,
} from "@/lib/pipe/pipe-checklist-template";
import { subscribePipeR3ChecklistChanged } from "@/lib/pipe/pipe-r3-checklist-events";
import { subscribePipeChanged } from "@/lib/pipe/pipe-events";

export function usePipeListR3MissingDocs(
  enabled: boolean,
  templates: PipeChecklistTemplates | null
) {
  const [missingByPipeId, setMissingByPipeId] = useState<Record<number, string[]>>({});

  const reload = useCallback(async () => {
    if (!enabled || !templates) {
      setMissingByPipeId({});
      return;
    }
    try {
      const rows = await listPipeR3MissingDocsSummaries();
      const map: Record<number, string[]> = {};
      for (const row of rows) {
        const labels = mapPipeChecklistKeysToLabels(row.missing_item_keys, "R3", templates);
        if (labels.length > 0) {
          map[row.pipe_id] = labels;
        }
      }
      setMissingByPipeId(map);
    } catch {
      setMissingByPipeId({});
    }
  }, [enabled, templates]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!enabled || !templates) return;

    const onChecklistChanged = (detail?: { pipeId: number; missingItemKeys: string[] }) => {
      if (!detail?.pipeId) {
        void reload();
        return;
      }
      setMissingByPipeId((prev) => {
        const next = { ...prev };
        const labels = mapPipeChecklistKeysToLabels(detail.missingItemKeys, "R3", templates);
        if (labels.length === 0) {
          delete next[detail.pipeId];
        } else {
          next[detail.pipeId] = labels;
        }
        return next;
      });
    };

    const onRefresh = () => {
      void reload();
    };

    const unsubChecklist = subscribePipeR3ChecklistChanged(onChecklistChanged);
    const unsubPipe = subscribePipeChanged(onRefresh);
    const unsubTemplates = subscribePipeChecklistTemplatesChanged(onRefresh);
    return () => {
      unsubChecklist();
      unsubPipe();
      unsubTemplates();
    };
  }, [enabled, reload, templates]);

  return missingByPipeId;
}
