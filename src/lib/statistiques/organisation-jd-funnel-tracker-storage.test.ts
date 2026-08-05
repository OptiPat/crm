import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearLegacyJdFunnelTrackerLocalStorage,
  getJdFunnelCountsForExercice,
  JD_FUNNEL_TRACKER_SETTING_KEY,
  loadJdFunnelTrackerState,
  saveJdFunnelTrackerState,
  setJdFunnelCountsForExercice,
} from "./organisation-jd-funnel-tracker-storage";
import { EMPTY_JD_FUNNEL_COUNTS } from "./organisation-jd-funnel-tracker";

vi.mock("@/lib/api/tauri-settings", () => ({
  getSetting: vi.fn(),
  setSetting: vi.fn(),
}));

import { getSetting, setSetting } from "@/lib/api/tauri-settings";

describe("organisation-jd-funnel-tracker-storage", () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    storage.clear();
    vi.mocked(getSetting).mockReset();
    vi.mocked(setSetting).mockReset();
    vi.mocked(getSetting).mockImplementation(async (key: string) => storage.get(key) ?? null);
    vi.mocked(setSetting).mockImplementation(async (key: string, value: string) => {
      storage.set(key, value);
    });
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(`ls:${key}`) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(`ls:${key}`, value);
      },
      removeItem: (key: string) => {
        storage.delete(`ls:${key}`);
      },
      clear: () => {
        for (const key of [...storage.keys()]) {
          if (key.startsWith("ls:")) storage.delete(key);
        }
      },
    });
    clearLegacyJdFunnelTrackerLocalStorage();
  });

  it("retourne un état vide si rien en DB ni en localStorage", async () => {
    const state = await loadJdFunnelTrackerState();
    expect(state.trackedExerciceLabel).toBeUndefined();
    expect(getJdFunnelCountsForExercice(state, "2026-2027")).toEqual(EMPTY_JD_FUNNEL_COUNTS);
  });

  it("persiste et recharge l'état depuis la DB", async () => {
    await saveJdFunnelTrackerState({
      trackedExerciceLabel: "2026-2027",
      countsByExercice: {
        "2026-2027": { confirmations: 10, presences: 5, parrainages: 2 },
      },
      savedAt: 1_700_000_000_000,
    });

    const loaded = await loadJdFunnelTrackerState();
    expect(loaded.trackedExerciceLabel).toBe("2026-2027");
    expect(loaded.countsByExercice["2026-2027"]).toEqual({
      confirmations: 10,
      presences: 5,
      parrainages: 2,
    });
    expect(storage.get(JD_FUNNEL_TRACKER_SETTING_KEY)).toBeTruthy();
  });

  it("migre le localStorage legacy vers SQLite", async () => {
    storage.set(
      "ls:crm_organisation_jd_funnel_tracker_v1",
      JSON.stringify({
        targetExerciceLabel: "2027-2028",
        countsByExercice: {
          "2027-2028": { confirmations: 3, presences: 1, parrainages: 0 },
        },
      })
    );

    const loaded = await loadJdFunnelTrackerState();
    expect(loaded.trackedExerciceLabel).toBe("2027-2028");
    expect(loaded.countsByExercice["2027-2028"]).toEqual({
      confirmations: 3,
      presences: 1,
      parrainages: 0,
    });
    expect(storage.get("ls:crm_organisation_jd_funnel_tracker_v1")).toBeUndefined();
    expect(storage.get(JD_FUNNEL_TRACKER_SETTING_KEY)).toBeTruthy();
  });

  it("setJdFunnelCountsForExercice ne mélange pas les exercices", () => {
    const state = setJdFunnelCountsForExercice(
      { countsByExercice: {}, savedAt: 1 },
      "2026-2027",
      { confirmations: 10, presences: 5, parrainages: 2 }
    );
    const next = setJdFunnelCountsForExercice(state, "2027-2028", {
      confirmations: 3,
      presences: 1,
      parrainages: 0,
    });
    expect(next.countsByExercice["2026-2027"]).toEqual({
      confirmations: 10,
      presences: 5,
      parrainages: 2,
    });
    expect(next.countsByExercice["2027-2028"]).toEqual({
      confirmations: 3,
      presences: 1,
      parrainages: 0,
    });
  });
});
