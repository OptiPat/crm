import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_GROUP_ACTIVE_CONSULTANT_VOLUME_BENCHMARK_EUROS,
  DEFAULT_GROUP_CONSULTANT_AVERAGE_VOLUME_BENCHMARK_EUROS,
  DEFAULT_GROUP_ACTIVE_CONSULTANT_RATE_BENCHMARK_PERCENT,
  DEFAULT_GROUP_SPONSOR_RATE_BENCHMARK_PERCENT,
  DEFAULT_GROUP_PARRAINAGES_PER_PARRAINEUR_BENCHMARK,
  DEFAULT_GROUP_NET_GROWTH_BENCHMARK_PERCENT,
  DEFAULT_GROUP_ATTRITION_BENCHMARK_PERCENT,
  DEFAULT_GROUP_VAA_DURATION_BENCHMARK_MONTHS,
  DEFAULT_GROUP_HABILITATION_DURATION_BENCHMARK_MONTHS,
  defaultStatistiquesBenchmarkSettings,
  formatHabilitationDurationVsGroupBenchmarkPercent,
  formatNetGrowthVsGroupBenchmarkPercent,
  formatAttritionVsGroupBenchmarkPercent,
  formatParrainagePerParraineurVsGroupBenchmarkPercent,
  formatSponsorRateVsGroupBenchmarkPercent,
  formatVaaDurationVsGroupBenchmarkPercent,
  formatVolumeVsGroupBenchmarkPercent,
  formatConsultantAverageVolumeVsGroupBenchmarkPercent,
  formatActiveConsultantRateVsGroupBenchmarkPercent,
  getFilleulActiveConsultantRateBenchmarkStatus,
  getFilleulHabilitationDurationBenchmarkStatus,
  getFilleulNetGrowthBenchmarkStatus,
  getFilleulAttritionBenchmarkStatus,
  getFilleulParrainagePerParraineurBenchmarkStatus,
  getFilleulSponsorRateBenchmarkStatus,
  getFilleulVaaDurationBenchmarkStatus,
  getFilleulVolumeBenchmarkStatus,
  getFilleulConsultantAverageVolumeBenchmarkStatus,
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
    expect(settings.groupConsultantAverageVolumeEuros).toBe(
      DEFAULT_GROUP_CONSULTANT_AVERAGE_VOLUME_BENCHMARK_EUROS
    );
    expect(settings.groupActiveConsultantRatePercent).toBe(
      DEFAULT_GROUP_ACTIVE_CONSULTANT_RATE_BENCHMARK_PERCENT
    );
    expect(settings.groupSponsorRatePercent).toBe(DEFAULT_GROUP_SPONSOR_RATE_BENCHMARK_PERCENT);
    expect(settings.groupParrainagesPerParraineur).toBe(
      DEFAULT_GROUP_PARRAINAGES_PER_PARRAINEUR_BENCHMARK
    );
    expect(settings.groupNetGrowthPercent).toBe(DEFAULT_GROUP_NET_GROWTH_BENCHMARK_PERCENT);
    expect(settings.groupAttritionPercent).toBe(DEFAULT_GROUP_ATTRITION_BENCHMARK_PERCENT);
    expect(settings.groupVaaDurationMonths).toBe(DEFAULT_GROUP_VAA_DURATION_BENCHMARK_MONTHS);
    expect(settings.groupHabilitationDurationMonths).toBe(
      DEFAULT_GROUP_HABILITATION_DURATION_BENCHMARK_MONTHS
    );
    expect(settings.nearGroupBenchmarkRatio).toBe(0.8);
  });

  it("persiste et recharge les réglages", () => {
    saveStatistiquesBenchmarkSettings({
      groupActiveConsultantVolumeEuros: 600_000,
      groupConsultantAverageVolumeEuros: 250_000,
      groupActiveConsultantRatePercent: 65,
      groupSponsorRatePercent: 30,
      groupParrainagesPerParraineur: 2.1,
      groupNetGrowthPercent: 25,
      groupAttritionPercent: 18,
      groupVaaDurationMonths: 12,
      groupHabilitationDurationMonths: 7,
      nearGroupBenchmarkRatio: 0.75,
    });
    const loaded = loadStatistiquesBenchmarkSettings();
    expect(loaded.groupActiveConsultantVolumeEuros).toBe(600_000);
    expect(loaded.groupConsultantAverageVolumeEuros).toBe(250_000);
    expect(loaded.groupActiveConsultantRatePercent).toBe(65);
    expect(loaded.groupSponsorRatePercent).toBe(30);
    expect(loaded.groupParrainagesPerParraineur).toBe(2.1);
    expect(loaded.groupNetGrowthPercent).toBe(25);
    expect(loaded.groupAttritionPercent).toBe(18);
    expect(loaded.groupVaaDurationMonths).toBe(12);
    expect(loaded.groupHabilitationDurationMonths).toBe(7);
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

  it("classe le volume moyen / consultant (actif ou non) vs référence groupe", () => {
    const settings = defaultStatistiquesBenchmarkSettings();
    expect(getFilleulConsultantAverageVolumeBenchmarkStatus(250_000, settings)).toBe("above_group");
    expect(getFilleulConsultantAverageVolumeBenchmarkStatus(228_000, settings)).toBe("above_group");
    expect(getFilleulConsultantAverageVolumeBenchmarkStatus(200_000, settings)).toBe("near_group");
    expect(getFilleulConsultantAverageVolumeBenchmarkStatus(182_400, settings)).toBe("near_group");
    expect(getFilleulConsultantAverageVolumeBenchmarkStatus(180_000, settings)).toBe("below_group");
    expect(formatConsultantAverageVolumeVsGroupBenchmarkPercent(250_000, settings)).toBe(
      "+10 % vs réf."
    );
  });

  it("formate l'écart en pourcentage", () => {
    const settings = defaultStatistiquesBenchmarkSettings();
    expect(formatVolumeVsGroupBenchmarkPercent(600_000, settings)).toBe("+10 % vs réf.");
    expect(formatVolumeVsGroupBenchmarkPercent(547_000, settings)).toBe("≈ référence");
    expect(formatVolumeVsGroupBenchmarkPercent(400_000, settings)).toBe("-27 % vs réf.");
  });

  it("classe le taux d'actifs vs référence groupe", () => {
    const settings = defaultStatistiquesBenchmarkSettings();
    expect(getFilleulActiveConsultantRateBenchmarkStatus(40, settings)).toBe("above_group");
    expect(getFilleulActiveConsultantRateBenchmarkStatus(30, settings)).toBe("above_group");
    expect(getFilleulActiveConsultantRateBenchmarkStatus(26, settings)).toBe("near_group");
    expect(getFilleulActiveConsultantRateBenchmarkStatus(24, settings)).toBe("near_group");
    expect(getFilleulActiveConsultantRateBenchmarkStatus(20, settings)).toBe("below_group");
    expect(formatActiveConsultantRateVsGroupBenchmarkPercent(40, settings)).toBe("+33 % vs réf.");
  });

  it("classe le taux de parraineurs vs référence groupe", () => {
    const settings = defaultStatistiquesBenchmarkSettings();
    expect(getFilleulSponsorRateBenchmarkStatus(30, settings)).toBe("above_group");
    expect(getFilleulSponsorRateBenchmarkStatus(26.5, settings)).toBe("above_group");
    expect(getFilleulSponsorRateBenchmarkStatus(22, settings)).toBe("near_group");
    expect(getFilleulSponsorRateBenchmarkStatus(21.3, settings)).toBe("near_group");
    expect(getFilleulSponsorRateBenchmarkStatus(20, settings)).toBe("below_group");
    expect(formatSponsorRateVsGroupBenchmarkPercent(30, settings)).toBe("+13 % vs réf.");
  });

  it("classe parrainages / parraineur vs référence groupe", () => {
    const settings = defaultStatistiquesBenchmarkSettings();
    expect(getFilleulParrainagePerParraineurBenchmarkStatus(2.2, settings)).toBe("above_group");
    expect(getFilleulParrainagePerParraineurBenchmarkStatus(1.9, settings)).toBe("above_group");
    expect(getFilleulParrainagePerParraineurBenchmarkStatus(1.6, settings)).toBe("near_group");
    expect(getFilleulParrainagePerParraineurBenchmarkStatus(1.52, settings)).toBe("near_group");
    expect(getFilleulParrainagePerParraineurBenchmarkStatus(1.5, settings)).toBe("below_group");
    expect(formatParrainagePerParraineurVsGroupBenchmarkPercent(2.2, settings)).toBe("+16 % vs réf.");
  });

  it("classe la croissance nette vs référence groupe", () => {
    const settings = defaultStatistiquesBenchmarkSettings();
    expect(getFilleulNetGrowthBenchmarkStatus(35, settings)).toBe("above_group");
    expect(getFilleulNetGrowthBenchmarkStatus(30, settings)).toBe("above_group");
    expect(getFilleulNetGrowthBenchmarkStatus(25, settings)).toBe("near_group");
    expect(getFilleulNetGrowthBenchmarkStatus(24, settings)).toBe("near_group");
    expect(getFilleulNetGrowthBenchmarkStatus(20, settings)).toBe("below_group");
    expect(formatNetGrowthVsGroupBenchmarkPercent(35, settings)).toBe("+17 % vs réf.");
  });

  it("classe l'attrition vs référence groupe (plus bas = mieux)", () => {
    const settings = defaultStatistiquesBenchmarkSettings();
    expect(getFilleulAttritionBenchmarkStatus(15, settings)).toBe("above_group");
    expect(getFilleulAttritionBenchmarkStatus(20, settings)).toBe("above_group");
    expect(getFilleulAttritionBenchmarkStatus(22, settings)).toBe("near_group");
    expect(getFilleulAttritionBenchmarkStatus(25, settings)).toBe("near_group");
    expect(getFilleulAttritionBenchmarkStatus(30, settings)).toBe("below_group");
    expect(formatAttritionVsGroupBenchmarkPercent(15, settings)).toBe("-25 % vs réf.");
  });

  it("classe le délai VAA/VA vs référence groupe (plus court = mieux)", () => {
    const settings = defaultStatistiquesBenchmarkSettings();
    expect(getFilleulVaaDurationBenchmarkStatus(12, settings)).toBe("above_group");
    expect(getFilleulVaaDurationBenchmarkStatus(14.62, settings)).toBe("above_group");
    expect(getFilleulVaaDurationBenchmarkStatus(16, settings)).toBe("near_group");
    expect(getFilleulVaaDurationBenchmarkStatus(18.275, settings)).toBe("near_group");
    expect(getFilleulVaaDurationBenchmarkStatus(19, settings)).toBe("below_group");
    expect(formatVaaDurationVsGroupBenchmarkPercent(12, settings)).toBe("-18 % vs réf.");
  });

  it("classe le délai habilitation vs référence groupe (plus court = mieux)", () => {
    const settings = defaultStatistiquesBenchmarkSettings();
    expect(getFilleulHabilitationDurationBenchmarkStatus(7, settings)).toBe("above_group");
    expect(getFilleulHabilitationDurationBenchmarkStatus(8.7, settings)).toBe("above_group");
    expect(getFilleulHabilitationDurationBenchmarkStatus(10, settings)).toBe("near_group");
    expect(formatHabilitationDurationVsGroupBenchmarkPercent(7, settings)).toBe("-20 % vs réf.");
  });
});
