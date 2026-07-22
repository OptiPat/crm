import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_GROUP_ACTIVE_CONSULTANT_VOLUME_BENCHMARK_EUROS,
  defaultStatistiquesBenchmarkSettings,
  formatVolumeVsGroupBenchmarkPercent,
  getFilleulVolumeBenchmarkStatus,
  loadStatistiquesBenchmarkSettings,
  saveStatistiquesBenchmarkSettings,
} from "./statistiques-benchmark-settings";

describe("statistiques-benchmark-settings", () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    storage.clear();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
      clear: () => {
        storage.clear();
      },
    });
  });

  it("utilise les valeurs par défaut si rien en stockage", () => {
    const settings = loadStatistiquesBenchmarkSettings();
    expect(settings.groupActiveConsultantVolumeEuros).toBe(
      DEFAULT_GROUP_ACTIVE_CONSULTANT_VOLUME_BENCHMARK_EUROS
    );
    expect(settings.nearGroupBenchmarkRatio).toBe(0.8);
  });

  it("persiste et recharge les réglages", () => {
    saveStatistiquesBenchmarkSettings({
      groupActiveConsultantVolumeEuros: 600_000,
      nearGroupBenchmarkRatio: 0.75,
    });
    const loaded = loadStatistiquesBenchmarkSettings();
    expect(loaded.groupActiveConsultantVolumeEuros).toBe(600_000);
    expect(loaded.nearGroupBenchmarkRatio).toBe(0.75);
  });

  it("classe le volume vs référence groupe (80 % / 100 %)", () => {
    const settings = defaultStatistiquesBenchmarkSettings();
    expect(getFilleulVolumeBenchmarkStatus(600_000, settings)).toBe("above_group");
    expect(getFilleulVolumeBenchmarkStatus(547_000, settings)).toBe("above_group");
    expect(getFilleulVolumeBenchmarkStatus(500_000, settings)).toBe("near_group");
    expect(getFilleulVolumeBenchmarkStatus(437_600, settings)).toBe("near_group");
    expect(getFilleulVolumeBenchmarkStatus(437_599, settings)).toBe("below_group");
  });

  it("formate l'écart en pourcentage", () => {
    const settings = defaultStatistiquesBenchmarkSettings();
    expect(formatVolumeVsGroupBenchmarkPercent(600_000, settings)).toBe("+10 % vs réf.");
    expect(formatVolumeVsGroupBenchmarkPercent(547_000, settings)).toBe("≈ référence");
    expect(formatVolumeVsGroupBenchmarkPercent(400_000, settings)).toBe("-27 % vs réf.");
  });
});
