import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getAutomationJobStats,
  recordAutomationJobStat,
} from "./background-automation-stats";

describe("background-automation-stats", () => {
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
      clear: () => storage.clear(),
    });
  });

  it("persiste une statistique valide", () => {
    recordAutomationJobStat("stellium", {
      finishedAtMs: 1000,
      durationMs: 250,
      detail: "2 mails",
    });
    expect(getAutomationJobStats().stellium).toEqual({
      finishedAtMs: 1000,
      durationMs: 250,
      detail: "2 mails",
    });
  });

  it("ignore les clés et valeurs corrompues", () => {
    localStorage.setItem(
      "crm-background-automation-stats-v1",
      JSON.stringify({
        inconnu: { finishedAtMs: 1, durationMs: 2, detail: "x" },
        stellium: { finishedAtMs: "hier", durationMs: 2, detail: "x" },
      })
    );
    expect(getAutomationJobStats()).toEqual({});
  });
});
