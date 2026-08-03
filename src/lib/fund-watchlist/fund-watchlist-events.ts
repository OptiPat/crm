export const FUND_WATCHLIST_CHANGED_EVENT = "fund-watchlist-changed";

export function notifyFundWatchlistChanged(): void {
  window.dispatchEvent(new CustomEvent(FUND_WATCHLIST_CHANGED_EVENT));
}

export function subscribeFundWatchlistChanged(listener: () => void): () => void {
  window.addEventListener(FUND_WATCHLIST_CHANGED_EVENT, listener);
  return () => window.removeEventListener(FUND_WATCHLIST_CHANGED_EVENT, listener);
}
