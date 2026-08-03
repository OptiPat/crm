import { invoke } from "@tauri-apps/api/core";
import type { CristallianceSupportsImportRow } from "@/lib/fund-watchlist/cristalliance-supports-import";
import { notifyFundWatchlistChanged } from "@/lib/fund-watchlist/fund-watchlist-events";

export interface FundWatchlistEntry {
  id: number;
  isin: string;
  nom: string;
  categorie?: string | null;
  notation_morningstar?: number | null;
  sri?: number | null;
  vl_previous?: number | null;
  vl_recent?: number | null;
  vl_date?: number | null;
  perf_ytd?: number | null;
  perf_1semaine?: number | null;
  perf_1mois?: number | null;
  perf_3mois?: number | null;
  perf_1an?: number | null;
  perf_3ans?: number | null;
  perf_5ans?: number | null;
  frais_gestion?: number | null;
  sfdr?: string | null;
  source_label: string;
  is_favorite: boolean;
  created_at: number;
  updated_at: number;
}

export interface FundWatchlistImportResult {
  inserted: number;
  updated: number;
  total: number;
}

export interface FundWatchlistFavoritesReport {
  markdown: string;
  generated_at: number;
  favorite_count: number;
  warnings: string[];
}

export async function getAllFundWatchlistEntries(): Promise<FundWatchlistEntry[]> {
  return await invoke<FundWatchlistEntry[]>("get_all_fund_watchlist_entries");
}

export async function importFundWatchlistEntries(
  rows: CristallianceSupportsImportRow[],
  sourceLabel = "cristalliance"
): Promise<FundWatchlistImportResult> {
  const result = await invoke<FundWatchlistImportResult>("import_fund_watchlist_entries", {
    rows,
    sourceLabel,
  });
  notifyFundWatchlistChanged();
  return result;
}

export async function setFundWatchlistFavorite(
  isin: string,
  isFavorite: boolean
): Promise<void> {
  await invoke<void>("set_fund_watchlist_favorite", { isin, isFavorite });
  notifyFundWatchlistChanged();
}

export async function startFundWatchlistFavoritesReport(): Promise<void> {
  await invoke<void>("start_fund_watchlist_favorites_report");
}

export async function fundWatchlistCoachReportInProgress(): Promise<boolean> {
  return await invoke<boolean>("fund_watchlist_coach_report_in_progress");
}
