import { useCallback, useEffect, useState } from "react";
import { getScpiCampaignDashboard, type ScpiCampaignDashboard } from "@/lib/api/tauri-scpi-campaign";
import {
  getStelliumPerfCampaignDashboard,
  type StelliumPerfCampaignDashboard,
} from "@/lib/api/tauri-stellium-perf-campaign";

export function useEmailCampaignsDashboard(refreshKey = 0) {
  const [scpi, setScpi] = useState<ScpiCampaignDashboard | null>(null);
  const [stellium, setStellium] = useState<StelliumPerfCampaignDashboard | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const [scpiDash, stDash] = await Promise.all([
        getScpiCampaignDashboard(),
        getStelliumPerfCampaignDashboard(),
      ]);
      setScpi(scpiDash);
      setStellium(stDash);
    } catch (error) {
      console.error(error);
      setScpi(null);
      setStellium(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload, refreshKey]);

  return { scpi, stellium, loading, reload };
}
