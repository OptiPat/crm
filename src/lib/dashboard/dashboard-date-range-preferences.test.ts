import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  loadDashboardDateRange,
  saveDashboardDateRange,
} from "./dashboard-date-range-preferences";

describe("dashboard-date-range-preferences", () => {
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
    });
  });

  it("persiste et recharge une plage valide", () => {
    saveDashboardDateRange({ from: "2020-07-05", to: "2026-07-05" });
    expect(loadDashboardDateRange()).toEqual({
      from: "2020-07-05",
      to: "2026-07-05",
    });
  });

  it("retourne la plage par défaut si stockage absent", () => {
    const range = loadDashboardDateRange();
    expect(range.from <= range.to).toBe(true);
  });
});
