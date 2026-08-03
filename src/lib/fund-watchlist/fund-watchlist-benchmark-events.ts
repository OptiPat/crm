import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { FundWatchlistBenchmark } from "@/lib/api/tauri-fund-watchlist";

export const FUND_WATCHLIST_BENCHMARK_SYNC_DONE_EVENT = "fund-watchlist-benchmark-sync-done";
export const FUND_WATCHLIST_BENCHMARK_SYNC_PROGRESS_EVENT =
  "fund-watchlist-benchmark-sync-progress";

export type FundWatchlistBenchmarkSyncDoneEvent = {
  ok: boolean;
  benchmarks: FundWatchlistBenchmark[];
  error?: string | null;
};

export type FundWatchlistBenchmarkSyncProgressEvent = {
  current: number;
  total: number;
  isin?: string | null;
};

export function subscribeFundWatchlistBenchmarkSyncDone(
  listener: (event: FundWatchlistBenchmarkSyncDoneEvent) => void
): () => void {
  let unlisten: UnlistenFn | undefined;
  let cancelled = false;

  void listen<FundWatchlistBenchmarkSyncDoneEvent>(
    FUND_WATCHLIST_BENCHMARK_SYNC_DONE_EVENT,
    (ev) => listener(ev.payload)
  ).then((fn) => {
    if (cancelled) fn();
    else unlisten = fn;
  });

  return () => {
    cancelled = true;
    unlisten?.();
  };
}

export function subscribeFundWatchlistBenchmarkSyncProgress(
  listener: (event: FundWatchlistBenchmarkSyncProgressEvent) => void
): () => void {
  let unlisten: UnlistenFn | undefined;
  let cancelled = false;

  void listen<FundWatchlistBenchmarkSyncProgressEvent>(
    FUND_WATCHLIST_BENCHMARK_SYNC_PROGRESS_EVENT,
    (ev) => listener(ev.payload)
  ).then((fn) => {
    if (cancelled) fn();
    else unlisten = fn;
  });

  return () => {
    cancelled = true;
    unlisten?.();
  };
}
