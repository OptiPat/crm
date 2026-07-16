import { describe, expect, it } from "vitest";
import { trayAutomationTickEnabled } from "@/lib/api/tauri-app-runtime";
import { DEFAULT_APP_RUNTIME_PREFS } from "@/lib/api/tauri-app-runtime";
import {
  automationJobAttemptCooldownRemainingMs,
  getAutomationJobLastRunForTests,
  markAutomationJobAttempt,
  markAutomationJobRun,
  resetAutomationJobStateForTests,
  shouldRunAutomationJob,
} from "@/lib/background/background-automation-state";

describe("trayAutomationTickEnabled", () => {
  it("master off désactive le tick", () => {
    expect(
      trayAutomationTickEnabled({
        ...DEFAULT_APP_RUNTIME_PREFS,
        background_automations: false,
      })
    ).toBe(false);
  });

  it("master on avec au moins un job actif", () => {
    expect(trayAutomationTickEnabled(DEFAULT_APP_RUNTIME_PREFS)).toBe(true);
  });

  it("applique un backoff aux tentatives sans marquer le job comme réussi", () => {
    resetAutomationJobStateForTests();
    markAutomationJobAttempt("stellium");
    expect(automationJobAttemptCooldownRemainingMs("stellium", 5 * 60_000)).toBeGreaterThan(0);
    expect(getAutomationJobLastRunForTests("stellium")).toBeUndefined();
  });
});

describe("shouldRunAutomationJob", () => {
  it("respecte l'intervalle", () => {
    resetAutomationJobStateForTests();
    expect(shouldRunAutomationJob("relation")).toBe(true);
    markAutomationJobRun("relation");
    expect(shouldRunAutomationJob("relation")).toBe(false);
  });

  it("persiste le dernier run (mémoire + stockage)", () => {
    resetAutomationJobStateForTests();
    const before = Date.now();
    markAutomationJobRun("stellium");
    expect(getAutomationJobLastRunForTests("stellium")).toBeGreaterThanOrEqual(before);
    expect(shouldRunAutomationJob("stellium")).toBe(false);
  });
});
