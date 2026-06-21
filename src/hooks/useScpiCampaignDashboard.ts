import { useCallback, useEffect, useState } from "react";
import {
  getScpiCampaignDashboard,
  type ScpiCampaignDashboard,
} from "@/lib/api/tauri-scpi-campaign";

export function useScpiCampaignDashboard(refreshKey = 0) {
  const [dashboard, setDashboard] = useState<ScpiCampaignDashboard | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      setDashboard(await getScpiCampaignDashboard());
    } catch (error) {
      console.error(error);
      setDashboard(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload, refreshKey]);

  return { dashboard, loading, reload };
}
