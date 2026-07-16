import { describe, expect, it, beforeEach } from "vitest";
import { DEFAULT_APP_RUNTIME_PREFS } from "@/lib/api/tauri-app-runtime";
import {
  buildDueForegroundJobs,
  isPipeRdvJobDue,
  isRelationJobDue,
  isBirthdaysGroupDue,
  pickNextForegroundGroup,
} from "@/lib/background/background-foreground-due-jobs";
import {
  markAutomationJobAttempt,
  markAutomationJobRun,
  resetAutomationJobStateForTests,
  shouldRunAutomationJob,
} from "@/lib/background/background-automation-state";

describe("pickNextForegroundGroup", () => {
  beforeEach(() => {
    resetAutomationJobStateForTests();
  });

  it("retourne null si foreground_automations est désactivé", () => {
    expect(
      pickNextForegroundGroup({
        ...DEFAULT_APP_RUNTIME_PREFS,
        foreground_automations: false,
      })
    ).toBeNull();
  });

  it("retourne null si aucun job n'est dû", () => {
    markAutomationJobRun("relation");
    markAutomationJobRun("stellium");
    markAutomationJobRun("box_placement");
    markAutomationJobRun("birthdays");
    markAutomationJobRun("pipe_rdv");
    expect(pickNextForegroundGroup(DEFAULT_APP_RUNTIME_PREFS)).toBeNull();
  });

  it("priorise le groupe relation quand tout est dû", () => {
    expect(pickNextForegroundGroup(DEFAULT_APP_RUNTIME_PREFS)).toBe("relation");
    const jobs = buildDueForegroundJobs(DEFAULT_APP_RUNTIME_PREFS);
    expect(jobs?.relation).toBe(true);
    expect(jobs?.pipe_rdv).toBe(true);
    expect(jobs?.stellium).toBeFalsy();
  });

  it("passe au groupe Stellium si relation déjà exécutée", () => {
    markAutomationJobRun("relation");
    markAutomationJobRun("pipe_rdv");
    expect(pickNextForegroundGroup(DEFAULT_APP_RUNTIME_PREFS)).toBe("stellium");
  });

  it("exclut Stellium si intervalle manuel (0)", () => {
    markAutomationJobRun("relation");
    markAutomationJobRun("pipe_rdv");
    const prefs = {
      ...DEFAULT_APP_RUNTIME_PREFS,
      stellium_interval_minutes: 0,
      box_placement_interval_minutes: 15,
    };
    expect(pickNextForegroundGroup(prefs)).toBe("stellium");
    const jobs = buildDueForegroundJobs(prefs);
    expect(jobs?.stellium).toBeFalsy();
    expect(jobs?.box_placement).toBe(true);
  });

  it("déclenche le groupe relation si seul pipe_rdv est dû", () => {
    markAutomationJobRun("relation");
    expect(isRelationJobDue(DEFAULT_APP_RUNTIME_PREFS)).toBe(false);
    expect(isPipeRdvJobDue(DEFAULT_APP_RUNTIME_PREFS)).toBe(true);
    expect(pickNextForegroundGroup(DEFAULT_APP_RUNTIME_PREFS)).toBe("relation");
    const jobs = buildDueForegroundJobs(DEFAULT_APP_RUNTIME_PREFS);
    expect(jobs?.relation).toBe(false);
    expect(jobs?.pipe_rdv).toBe(true);
  });

  it("applique un backoff court à une tentative relation sans la marquer réussie", () => {
    expect(isRelationJobDue(DEFAULT_APP_RUNTIME_PREFS)).toBe(true);
    markAutomationJobAttempt("relation");
    expect(isRelationJobDue(DEFAULT_APP_RUNTIME_PREFS)).toBe(false);
    expect(shouldRunAutomationJob("relation")).toBe(true);
  });

  it("diffère seulement le contrôle anniversaire foreground après une fenêtre visible", () => {
    expect(isBirthdaysGroupDue(DEFAULT_APP_RUNTIME_PREFS)).toBe(true);
    markAutomationJobAttempt("birthdays");
    expect(isBirthdaysGroupDue(DEFAULT_APP_RUNTIME_PREFS)).toBe(false);
    expect(shouldRunAutomationJob("birthdays")).toBe(true);
  });
});
