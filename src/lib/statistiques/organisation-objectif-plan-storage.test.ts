import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearLegacyOrganisationObjectifLocalStorage,
  loadOrganisationObjectifPlan,
  mergeOrganisationObjectifTablePrefs,
  normalizeOrganisationObjectifPlan,
  organisationObjectifPlanSettingKey,
  saveOrganisationObjectifPlan,
} from "./organisation-objectif-plan-storage";

vi.mock("@/lib/api/tauri-settings", () => ({
  getSetting: vi.fn(),
  setSetting: vi.fn(),
}));

import { getSetting, setSetting } from "@/lib/api/tauri-settings";

describe("organisation-objectif-plan-storage", () => {
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
    clearLegacyOrganisationObjectifLocalStorage();
  });

  it("mergeOrganisationObjectifTablePrefs retire une clé avec undefined", () => {
    expect(
      mergeOrganisationObjectifTablePrefs(
        { targetGrowthPercent: 50, attritionPercent: 20 },
        { targetGrowthPercent: undefined }
      )
    ).toEqual({ attritionPercent: 20 });
  });

  it("charge un plan vide si rien en DB ni en localStorage", async () => {
    const plan = await loadOrganisationObjectifPlan("2026-2027");
    expect(plan.tablePrefs).toEqual({});
    expect(plan.projectionOverridesByYear).toEqual({});
  });

  it("persiste et recharge un plan depuis la DB", async () => {
    await saveOrganisationObjectifPlan("2026-2027", {
      tablePrefs: { targetGrowthPercent: 100 },
      projectionOverridesByYear: { 3: { targetGrowthPercent: 80 } },
      savedAt: 1_700_000_000_000,
    });

    const loaded = await loadOrganisationObjectifPlan("2026-2027");
    expect(loaded.tablePrefs).toEqual({ targetGrowthPercent: 100 });
    expect(loaded.projectionOverridesByYear[3]).toEqual({ targetGrowthPercent: 80 });
    expect(loaded.savedAt).toBe(1_700_000_000_000);
    expect(storage.get(organisationObjectifPlanSettingKey("2026-2027"))).toBeTruthy();
  });

  it("migre le localStorage legacy vers l'exercice courant uniquement", async () => {
    const now = new Date("2026-08-05T12:00:00Z");
    storage.set("ls:crm_organisation_objectif_table_v1", JSON.stringify({ targetGrowthPercent: 50 }));
    storage.set(
      "ls:crm_organisation_growth_projection_v1",
      JSON.stringify({ overridesByYear: { "4": { attritionPercent: 25 } } })
    );

    const current = await loadOrganisationObjectifPlan("2026-2027", now);
    expect(current.tablePrefs).toEqual({ targetGrowthPercent: 50 });
    expect(current.projectionOverridesByYear[4]).toEqual({ attritionPercent: 25 });
    expect(storage.get("ls:crm_organisation_objectif_table_v1")).toBeUndefined();

    const other = await loadOrganisationObjectifPlan("2024-2025", now);
    expect(other.tablePrefs).toEqual({});
    expect(other.projectionOverridesByYear).toEqual({});
  });

  it("normalise un JSON invalide sans planter", () => {
    expect(normalizeOrganisationObjectifPlan(null)).toBeNull();
    expect(
      normalizeOrganisationObjectifPlan({
        tablePrefs: { targetGrowthPercent: "bad" },
        projectionOverridesByYear: { 1: { targetGrowthPercent: 10 } },
        savedAt: "x",
      })
    ).toEqual({
      tablePrefs: {},
      projectionOverridesByYear: {},
      savedAt: expect.any(Number),
    });
  });
});
