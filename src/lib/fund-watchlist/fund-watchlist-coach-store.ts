import type { FundWatchlistFavoritesReport } from "@/lib/api/tauri-fund-watchlist";
import type { FundWatchlistCoachProgressEvent } from "@/lib/fund-watchlist/fund-watchlist-coach-events";

const REPORT_KEY = "fund-watchlist-coach-report";
const GENERATING_KEY = "fund-watchlist-coach-generating";
const GENERATING_PENDING_KEY = "fund-watchlist-coach-generating-pending";
const OPEN_DIALOG_KEY = "fund-watchlist-coach-open-dialog";
const PROGRESS_KEY = "fund-watchlist-coach-progress";
const GENERATING_PENDING_MAX_MS = 15 * 60 * 1000;

export const FUND_WATCHLIST_COACH_STORE_EVENT = "fund-watchlist-coach-store-changed";

function notify() {
  window.dispatchEvent(new CustomEvent(FUND_WATCHLIST_COACH_STORE_EVENT));
}

export function loadCoachReport(): FundWatchlistFavoritesReport | null {
  try {
    const raw = sessionStorage.getItem(REPORT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as FundWatchlistFavoritesReport;
  } catch {
    return null;
  }
}

export function saveCoachReport(report: FundWatchlistFavoritesReport | null): void {
  if (report) {
    sessionStorage.setItem(REPORT_KEY, JSON.stringify(report));
  } else {
    sessionStorage.removeItem(REPORT_KEY);
  }
  notify();
}

export function loadCoachGenerating(): boolean {
  return sessionStorage.getItem(GENERATING_KEY) === "1";
}

export function saveCoachGenerating(generating: boolean): void {
  if (generating) {
    sessionStorage.setItem(GENERATING_KEY, "1");
  } else {
    sessionStorage.removeItem(GENERATING_KEY);
    clearCoachGenerationPending();
    clearCoachProgress();
  }
  notify();
}

export function loadCoachProgress(): FundWatchlistCoachProgressEvent | null {
  try {
    const raw = sessionStorage.getItem(PROGRESS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as FundWatchlistCoachProgressEvent;
  } catch {
    return null;
  }
}

export function saveCoachProgress(progress: FundWatchlistCoachProgressEvent | null): void {
  if (progress) {
    sessionStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  } else {
    sessionStorage.removeItem(PROGRESS_KEY);
  }
  notify();
}

export function clearCoachProgress(): void {
  sessionStorage.removeItem(PROGRESS_KEY);
}

/** Démarrage local avant que le backend confirme REPORT_RUNNING (évite le poll qui remet idle). */
export function markCoachGenerationPending(): void {
  sessionStorage.setItem(GENERATING_PENDING_KEY, String(Date.now()));
  saveCoachGenerating(true);
}

export function clearCoachGenerationPending(): void {
  sessionStorage.removeItem(GENERATING_PENDING_KEY);
}

export function isCoachGenerationPending(): boolean {
  const raw = sessionStorage.getItem(GENERATING_PENDING_KEY);
  if (!raw) return false;
  const startedAt = Number(raw);
  if (!Number.isFinite(startedAt)) {
    clearCoachGenerationPending();
    return false;
  }
  if (Date.now() - startedAt > GENERATING_PENDING_MAX_MS) {
    clearCoachGenerationPending();
    return false;
  }
  return true;
}

export function consumeCoachOpenDialog(): boolean {
  const pending = sessionStorage.getItem(OPEN_DIALOG_KEY) === "1";
  if (pending) {
    sessionStorage.removeItem(OPEN_DIALOG_KEY);
  }
  return pending;
}

export function requestCoachOpenDialog(): void {
  sessionStorage.setItem(OPEN_DIALOG_KEY, "1");
  notify();
}
