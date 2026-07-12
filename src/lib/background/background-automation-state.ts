import type { BackgroundAutomationJob } from "@/lib/background/background-automation-intervals";
import { JOB_COOLDOWN_MS, JOB_INTERVAL_MS } from "@/lib/background/background-automation-intervals";

const lastRunMs = new Map<BackgroundAutomationJob, number>();

export function shouldRunAutomationJob(
  job: BackgroundAutomationJob,
  options?: { force?: boolean; minIntervalMs?: number }
): boolean {
  if (options?.force) return true;
  const interval = options?.minIntervalMs ?? JOB_INTERVAL_MS[job];
  const last = lastRunMs.get(job) ?? 0;
  return Date.now() - last >= interval;
}

export function markAutomationJobRun(job: BackgroundAutomationJob): void {
  lastRunMs.set(job, Date.now());
}

export function automationJobCooldownRemainingMs(job: BackgroundAutomationJob): number {
  const cooldown = JOB_COOLDOWN_MS[job];
  if (cooldown == null) return 0;
  const last = lastRunMs.get(job) ?? 0;
  return Math.max(0, cooldown - (Date.now() - last));
}

/** Pour les rafraîchissements au focus (cooldown plus court). */
export function shouldRunAutomationJobWithCooldown(
  job: BackgroundAutomationJob,
  options?: { force?: boolean }
): boolean {
  if (options?.force) return true;
  return automationJobCooldownRemainingMs(job) <= 0;
}

export function resetAutomationJobStateForTests(): void {
  lastRunMs.clear();
}
