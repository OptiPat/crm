import type { BackgroundAutomationJob } from "@/lib/background/background-automation-intervals";
import {
  BIRTHDAY_VISIBLE_DEFER_MS,
  MAIL_UNAVAILABLE_RETRY_MS,
  boxPlacementAutoScanEnabled,
  getJobIntervalMs,
  stelliumAutoScanEnabled,
} from "@/lib/background/background-automation-intervals";
import {
  automationJobAttemptCooldownRemainingMs,
  automationJobCooldownRemainingMs,
  shouldRunAutomationJob,
  shouldRunAutomationJobWithCooldown,
} from "@/lib/background/background-automation-state";
import type { AppRuntimePrefs } from "@/lib/api/tauri-app-runtime";
import { runBackgroundAutomationCycle } from "@/lib/background/background-automation-runner";

export type ForegroundDueJobs = Partial<Record<BackgroundAutomationJob, boolean>>;

export type ForegroundJobGroup = "relation" | "stellium" | "birthdays";

const IDLE_JOBS: ForegroundDueJobs = {
  relation: false,
  pipe_rdv: false,
  stellium: false,
  box_placement: false,
  birthdays: false,
};

export function isRelationJobDue(prefs: AppRuntimePrefs): boolean {
  if (!prefs.foreground_automations) return false;
  if (automationJobCooldownRemainingMs("relation") > 0) return false;
  if (
    automationJobAttemptCooldownRemainingMs("relation", MAIL_UNAVAILABLE_RETRY_MS) > 0
  ) {
    return false;
  }
  return shouldRunAutomationJob("relation", {
    minIntervalMs: getJobIntervalMs(prefs, "relation"),
  });
}

export function isPipeRdvJobDue(prefs: AppRuntimePrefs): boolean {
  if (!prefs.foreground_automations) return false;
  if (automationJobCooldownRemainingMs("pipe_rdv") > 0) return false;
  return shouldRunAutomationJob("pipe_rdv", {
    minIntervalMs: getJobIntervalMs(prefs, "pipe_rdv"),
  });
}

export function isRelationGroupDue(prefs: AppRuntimePrefs): boolean {
  return isRelationJobDue(prefs) || isPipeRdvJobDue(prefs);
}

export function getStelliumGroupJobs(prefs: AppRuntimePrefs): ForegroundDueJobs | null {
  if (!prefs.foreground_automations) return null;
  const stelliumDue =
    stelliumAutoScanEnabled(prefs) &&
    automationJobAttemptCooldownRemainingMs("stellium", MAIL_UNAVAILABLE_RETRY_MS) === 0 &&
    shouldRunAutomationJobWithCooldown("stellium", {
      minIntervalMs: getJobIntervalMs(prefs, "stellium"),
    });
  const boxPlacementDue =
    boxPlacementAutoScanEnabled(prefs) &&
    automationJobAttemptCooldownRemainingMs("box_placement", MAIL_UNAVAILABLE_RETRY_MS) === 0 &&
    shouldRunAutomationJobWithCooldown("box_placement", {
      minIntervalMs: getJobIntervalMs(prefs, "box_placement"),
    });
  if (!stelliumDue && !boxPlacementDue) return null;
  return {
    ...IDLE_JOBS,
    stellium: stelliumDue,
    box_placement: boxPlacementDue,
  };
}

export function isBirthdaysGroupDue(prefs: AppRuntimePrefs): boolean {
  if (!prefs.foreground_automations) return false;
  if (
    automationJobAttemptCooldownRemainingMs("birthdays", BIRTHDAY_VISIBLE_DEFER_MS) > 0
  ) {
    return false;
  }
  return shouldRunAutomationJobWithCooldown("birthdays", {
    minIntervalMs: getJobIntervalMs(prefs, "birthdays"),
  });
}

/** Un seul groupe par passage (wake / mount / tick) : relation → Stellium/Box → anniversaires. */
export function pickNextForegroundGroup(prefs: AppRuntimePrefs): ForegroundJobGroup | null {
  if (!prefs.foreground_automations) return null;
  if (isRelationGroupDue(prefs)) return "relation";
  if (getStelliumGroupJobs(prefs)) return "stellium";
  if (isBirthdaysGroupDue(prefs)) return "birthdays";
  return null;
}

export function foregroundJobsForGroup(
  group: ForegroundJobGroup,
  prefs: AppRuntimePrefs
): ForegroundDueJobs {
  switch (group) {
    case "relation":
      return {
        ...IDLE_JOBS,
        relation: isRelationJobDue(prefs),
        pipe_rdv: isPipeRdvJobDue(prefs),
      };
    case "stellium":
      return getStelliumGroupJobs(prefs) ?? IDLE_JOBS;
    case "birthdays":
      return { ...IDLE_JOBS, birthdays: true };
  }
}

/** @deprecated diagnostic / tests — préférer pickNextForegroundGroup */
export function buildDueForegroundJobs(prefs: AppRuntimePrefs): ForegroundDueJobs | null {
  const group = pickNextForegroundGroup(prefs);
  if (!group) return null;
  return foregroundJobsForGroup(group, prefs);
}

/** Lance au plus un groupe foreground dû. */
export async function runNextForegroundGroupIfDue(
  prefs: AppRuntimePrefs
): Promise<boolean> {
  const group = pickNextForegroundGroup(prefs);
  if (!group) return false;
  await runBackgroundAutomationCycle({
    surface: "foreground",
    jobs: foregroundJobsForGroup(group, prefs),
  });
  return true;
}
