import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  computeJdFunnelProgressPercent,
  EMPTY_JD_FUNNEL_COUNTS,
  loadJdFunnelCounts,
  loadJdFunnelTrackerExerciceLabel,
  saveJdFunnelCounts,
  saveJdFunnelTrackerExerciceLabel,
} from "./organisation-jd-funnel-tracker";

describe("organisation-jd-funnel-tracker", () => {
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

  it("retourne des compteurs vides et pas d'exercice ciblé par défaut", () => {
    expect(loadJdFunnelTrackerExerciceLabel()).toBeUndefined();
    expect(loadJdFunnelCounts("2026-2027")).toEqual(EMPTY_JD_FUNNEL_COUNTS);
  });

  it("persiste l'exercice ciblé", () => {
    saveJdFunnelTrackerExerciceLabel("2026-2027");
    expect(loadJdFunnelTrackerExerciceLabel()).toBe("2026-2027");
  });

  it("persiste les compteurs par exercice sans les mélanger", () => {
    saveJdFunnelCounts("2026-2027", { confirmations: 10, presences: 5, parrainages: 2 });
    saveJdFunnelCounts("2027-2028", { confirmations: 3, presences: 1, parrainages: 0 });
    expect(loadJdFunnelCounts("2026-2027")).toEqual({ confirmations: 10, presences: 5, parrainages: 2 });
    expect(loadJdFunnelCounts("2027-2028")).toEqual({ confirmations: 3, presences: 1, parrainages: 0 });
  });

  it("ignore un JSON corrompu sans planter", () => {
    storage.set("crm_organisation_jd_funnel_tracker_v1", "{invalide");
    expect(loadJdFunnelCounts("2026-2027")).toEqual(EMPTY_JD_FUNNEL_COUNTS);
  });

  it("calcule la progression, sans la plafonner à 100 % (dépassement visible)", () => {
    expect(computeJdFunnelProgressPercent(32, 64)).toBe(50);
    expect(computeJdFunnelProgressPercent(80, 64)).toBe(125);
    expect(computeJdFunnelProgressPercent(0, 64)).toBe(0);
    expect(computeJdFunnelProgressPercent(10, null)).toBeNull();
    expect(computeJdFunnelProgressPercent(10, 0)).toBeNull();
  });
});
