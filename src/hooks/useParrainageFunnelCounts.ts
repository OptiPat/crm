import { useCallback, useEffect, useState } from "react";
import {
  getParrainageFunnelCounts,
  type ParrainageFunnelCounts,
} from "@/lib/api/tauri-parrainage-pipe";
import { subscribeParrainagePipeChanged } from "@/lib/parrainage-pipe/parrainage-pipe-events";
import { EMPTY_JD_FUNNEL_COUNTS } from "@/lib/statistiques/organisation-jd-funnel-tracker";

export function useParrainageFunnelCounts(exerciceLabel: string) {
  const [counts, setCounts] = useState<ParrainageFunnelCounts>(EMPTY_JD_FUNNEL_COUNTS);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const next = await getParrainageFunnelCounts(exerciceLabel);
      setCounts(next);
    } catch {
      setCounts(EMPTY_JD_FUNNEL_COUNTS);
    } finally {
      setLoading(false);
    }
  }, [exerciceLabel]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => subscribeParrainagePipeChanged(() => void reload()), [reload]);

  return { counts, loading, reload };
}
