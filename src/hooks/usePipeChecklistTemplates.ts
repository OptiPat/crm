import { useCallback, useEffect, useState } from "react";
import {
  loadPipeChecklistTemplates,
  subscribePipeChecklistTemplatesChanged,
  type PipeChecklistTemplates,
} from "@/lib/pipe/pipe-checklist-template";

export function usePipeChecklistTemplates() {
  const [templates, setTemplates] = useState<PipeChecklistTemplates | null>(null);

  const reload = useCallback(async () => {
    setTemplates(await loadPipeChecklistTemplates());
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => subscribePipeChecklistTemplatesChanged(() => void reload()), [reload]);

  return { templates, reload };
}
