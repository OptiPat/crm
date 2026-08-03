import type { FundWatchlistBenchmark } from "@/lib/api/tauri-fund-watchlist";
import { spawnFundWatchlistBoursoramaBenchmarksSync } from "@/lib/api/tauri-fund-watchlist";
import {
  subscribeFundWatchlistBenchmarkSyncDone,
  subscribeFundWatchlistBenchmarkSyncProgress,
  type FundWatchlistBenchmarkSyncDoneEvent,
} from "@/lib/fund-watchlist/fund-watchlist-benchmark-events";

export function waitForFundWatchlistBenchmarkSync(
  isins: string[],
  onProgress?: (current: number, total: number) => void
): Promise<FundWatchlistBenchmark[]> {
  if (isins.length === 0) {
    return Promise.resolve([]);
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = (unsubDone: () => void, unsubProgress: () => void) => {
      unsubDone();
      unsubProgress();
    };

    const unsubProgress = subscribeFundWatchlistBenchmarkSyncProgress((progress) => {
      onProgress?.(progress.current, progress.total);
    });

    const finish = (unsubDone: () => void, event: FundWatchlistBenchmarkSyncDoneEvent) => {
      if (settled) return;
      settled = true;
      cleanup(unsubDone, unsubProgress);
      if (event.ok) resolve(event.benchmarks);
      else reject(new Error(event.error ?? "Échec mise à jour des références marché."));
    };

    const unsubDone = subscribeFundWatchlistBenchmarkSyncDone((event) => finish(unsubDone, event));

    void spawnFundWatchlistBoursoramaBenchmarksSync(isins).catch((error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup(unsubDone, unsubProgress);
      reject(error instanceof Error ? error : new Error(String(error)));
    });
  });
}
