import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { FundWatchlistFavoritesReport } from "@/lib/api/tauri-fund-watchlist";

export const FUND_WATCHLIST_COACH_REPORT_DONE_EVENT = "fund-watchlist-coach-report-done";

export const FUND_WATCHLIST_COACH_TOAST_ID = "fund-watchlist-coach-report";

export type FundWatchlistCoachReportEvent = {
  ok: boolean;
  report?: FundWatchlistFavoritesReport | null;
  error?: string | null;
};

export function subscribeFundWatchlistCoachReportDone(
  listener: (event: FundWatchlistCoachReportEvent) => void
): () => void {
  let unlisten: UnlistenFn | undefined;
  let cancelled = false;

  void listen<FundWatchlistCoachReportEvent>(FUND_WATCHLIST_COACH_REPORT_DONE_EVENT, (ev) => {
    listener(ev.payload);
  }).then((fn) => {
    if (cancelled) {
      fn();
    } else {
      unlisten = fn;
    }
  });

  return () => {
    cancelled = true;
    unlisten?.();
  };
}
