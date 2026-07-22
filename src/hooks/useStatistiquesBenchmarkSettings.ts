import { useEffect, useState } from "react";
import {
  loadStatistiquesBenchmarkSettings,
  STATISTIQUES_BENCHMARK_SETTINGS_CHANGED,
  type StatistiquesBenchmarkSettings,
} from "@/lib/statistiques/statistiques-benchmark-settings";

export function useStatistiquesBenchmarkSettings(): StatistiquesBenchmarkSettings {
  const [settings, setSettings] = useState(loadStatistiquesBenchmarkSettings);

  useEffect(() => {
    const handler = () => setSettings(loadStatistiquesBenchmarkSettings());
    window.addEventListener(STATISTIQUES_BENCHMARK_SETTINGS_CHANGED, handler);
    return () => window.removeEventListener(STATISTIQUES_BENCHMARK_SETTINGS_CHANGED, handler);
  }, []);

  return settings;
}
