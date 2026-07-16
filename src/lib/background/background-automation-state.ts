import type { BackgroundAutomationJob } from "@/lib/background/background-automation-intervals";
import {
  isBackgroundAutomationJob,
  JOB_COOLDOWN_MS,
  JOB_INTERVAL_MS,
} from "@/lib/background/background-automation-intervals";

const LAST_RUN_STORAGE_KEY = "crm-background-automation-last-run-v1";

type LastRunStore = Partial<Record<BackgroundAutomationJob, number>>;

const lastRunMs = new Map<BackgroundAutomationJob, number>();
const lastAttemptMs = new Map<BackgroundAutomationJob, number>();

function readLastRunStore(): LastRunStore {
  try {
    const raw = localStorage.getItem(LAST_RUN_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as LastRunStore;
  } catch {
    return {};
  }
}

function writeLastRunStore(store: LastRunStore): void {
  try {
    localStorage.setItem(LAST_RUN_STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* quota / mode privé */
  }
}

function hydrateLastRunMsFromStorage(): void {
  const store = readLastRunStore();
  for (const [job, ms] of Object.entries(store)) {
    if (isBackgroundAutomationJob(job) && typeof ms === "number" && Number.isFinite(ms)) {
      lastRunMs.set(job, ms);
    }
  }
}

hydrateLastRunMsFromStorage();

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
  const now = Date.now();
  lastRunMs.set(job, now);
  const store = readLastRunStore();
  store[job] = now;
  writeLastRunStore(store);
}

/** Note une tentative sans la confondre avec un scan réussi (backoff court). */
export function markAutomationJobAttempt(job: BackgroundAutomationJob): void {
  lastAttemptMs.set(job, Date.now());
}

export function automationJobAttemptCooldownRemainingMs(
  job: BackgroundAutomationJob,
  minCooldownMs: number
): number {
  const last = lastAttemptMs.get(job) ?? 0;
  return Math.max(0, minCooldownMs - (Date.now() - last));
}

export function automationJobCooldownRemainingMs(
  job: BackgroundAutomationJob,
  options?: { minCooldownMs?: number }
): number {
  const cooldown = options?.minCooldownMs ?? JOB_COOLDOWN_MS[job];
  if (cooldown == null) return 0;
  const last = lastRunMs.get(job) ?? 0;
  return Math.max(0, cooldown - (Date.now() - last));
}

/** Pour les rafraîchissements au focus (cooldown plus court). */
export function shouldRunAutomationJobWithCooldown(
  job: BackgroundAutomationJob,
  options?: { force?: boolean; minIntervalMs?: number; minCooldownMs?: number }
): boolean {
  if (options?.force) return true;
  if (automationJobCooldownRemainingMs(job, { minCooldownMs: options?.minCooldownMs }) > 0) {
    return false;
  }
  if (options?.minIntervalMs != null) {
    return shouldRunAutomationJob(job, { minIntervalMs: options.minIntervalMs });
  }
  return true;
}

export function resetAutomationJobStateForTests(): void {
  lastRunMs.clear();
  lastAttemptMs.clear();
  try {
    localStorage.removeItem(LAST_RUN_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function getAutomationJobLastRunForTests(
  job: BackgroundAutomationJob
): number | undefined {
  return lastRunMs.get(job);
}
