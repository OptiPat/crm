import { describe, expect, it } from "vitest";
import { trayAutomationTickEnabled } from "@/lib/api/tauri-app-runtime";
import { DEFAULT_APP_RUNTIME_PREFS } from "@/lib/api/tauri-app-runtime";
import {
  shouldRunAutomationJob,
  resetAutomationJobStateForTests,
  markAutomationJobRun,
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
});

describe("shouldRunAutomationJob", () => {
  it("respecte l'intervalle", () => {
    resetAutomationJobStateForTests();
    expect(shouldRunAutomationJob("relation")).toBe(true);
    markAutomationJobRun("relation");
    expect(shouldRunAutomationJob("relation")).toBe(false);
  });
});
