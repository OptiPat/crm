import { invoke } from "@tauri-apps/api/core";

export interface UcPilierScores {
  performance?: number | null;
  risque?: number | null;
  structure?: number | null;
}

export interface UcFundResultScore {
  isin: string;
  nom: string;
  rank: number;
  score_relative_total: number;
  pilier_scores: UcPilierScores;
  criterion_scores: number[];
  alerts: string[];
}

export interface UcCriterionScore {
  key: string;
  label: string;
  weight_global: number;
  scores: number[];
  available: boolean;
}

export interface UcFundMetricsSnapshot {
  isin: string;
  perf_1an?: number | null;
  perf_3ans?: number | null;
  perf_5ans?: number | null;
  perf_ytd?: number | null;
  sharpe_3y?: number | null;
  top10_percent?: number | null;
}

export interface CompareRequest {
  isins: string[];
  forceVersion?: string | null;
}

export interface CompareResponse {
  comparatif_id: string;
  scoring_version: string;
  confidence_index: number;
  verdict: UcVerdict;
  winner_isin?: string | null;
  is_category_matched: boolean;
  category?: string | null;
  score_gap?: number | null;
  fund_order: string[];
  criteria: UcCriterionScore[];
  metrics: UcFundMetricsSnapshot[];
  results: UcFundResultScore[];
  raw_json_payload: string;
}

export type UcVerdict =
  | "WINNER_DECLARED"
  | "TIE"
  | "INSUFFICIENT_DATA"
  | "CATEGORY_MISMATCH";

export async function runUcComparison(request: CompareRequest): Promise<CompareResponse> {
  return await invoke<CompareResponse>("run_uc_comparison", {
    request: {
      isins: request.isins,
      force_version: request.forceVersion ?? null,
    },
  });
}
