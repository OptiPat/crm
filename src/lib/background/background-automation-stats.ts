import {
  isBackgroundAutomationJob,
  type BackgroundAutomationJob,
} from "@/lib/background/background-automation-intervals";

export type AutomationJobStat = {
  finishedAtMs: number;
  durationMs: number;
  detail: string;
};

const STORAGE_KEY = "crm-background-automation-stats-v1";

type StatsStore = Partial<Record<BackgroundAutomationJob, AutomationJobStat>>;

function readStore(): StatsStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const store: StatsStore = {};
    for (const [job, value] of Object.entries(parsed)) {
      if (!isBackgroundAutomationJob(job) || !value || typeof value !== "object") continue;
      const stat = value as Partial<AutomationJobStat>;
      if (
        typeof stat.finishedAtMs === "number" &&
        Number.isFinite(stat.finishedAtMs) &&
        typeof stat.durationMs === "number" &&
        Number.isFinite(stat.durationMs) &&
        typeof stat.detail === "string"
      ) {
        store[job] = {
          finishedAtMs: stat.finishedAtMs,
          durationMs: stat.durationMs,
          detail: stat.detail,
        };
      }
    }
    return store;
  } catch {
    return {};
  }
}

function writeStore(store: StatsStore): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* quota / mode privé */
  }
}

export function recordAutomationJobStat(
  job: BackgroundAutomationJob,
  stat: Omit<AutomationJobStat, "finishedAtMs"> & { finishedAtMs?: number }
): void {
  const store = readStore();
  store[job] = {
    finishedAtMs: stat.finishedAtMs ?? Date.now(),
    durationMs: stat.durationMs,
    detail: stat.detail,
  };
  writeStore(store);
}

export function getAutomationJobStats(): StatsStore {
  return readStore();
}

export function formatAutomationJobStat(stat: AutomationJobStat | undefined): string | null {
  if (!stat) return null;
  const when = new Date(stat.finishedAtMs).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const seconds = Math.max(1, Math.round(stat.durationMs / 1000));
  return `${when} · ${stat.detail} · ${seconds} s`;
}
