import { useCallback, useEffect, useState } from "react";
import {
  loadR3ImmoChecklistTemplate,
  subscribeR3ImmoChecklistTemplatesChanged,
  type R3ImmoChecklistTemplate,
} from "@/lib/pipe/r3-immo-checklist-template";

export function useR3ImmoChecklistTemplate() {
  const [template, setTemplate] = useState<R3ImmoChecklistTemplate | null>(null);

  const reload = useCallback(async () => {
    setTemplate(await loadR3ImmoChecklistTemplate());
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => subscribeR3ImmoChecklistTemplatesChanged(() => void reload()), [reload]);

  return { template, reload };
}
