import type { FundWatchlistEntry } from "@/lib/api/tauri-fund-watchlist";
import type {
  FundDiagnostic,
  FundDiagnosticStatus,
} from "@/lib/fund-watchlist/fund-watchlist-diagnostic";

/**
 * Transmis tel quel à la commande Tauri du coach : les clés suivent la structure Rust
 * `FundCoachDiagnostic` (snake_case), comme le reste de l'IPC veille fonds.
 */
export type FundCoachDiagnosticPayload = {
  isin: string;
  status: FundDiagnosticStatus;
  delta_1an_vs_category: number | null;
  delta_reference_label: string | null;
  trigger_reasons: string[];
  /** Motif d'abstention quand le CRM ne déclenche rien (référence catégorie absente, par ex.). */
  reasons: string[];
  /**
   * Nuances déjà visibles par le CGP sur le badge (correction sur une année encore solide,
   * respiration court terme) : sans elles, le coach durcissait un statut que le badge nuançait.
   */
  context_reasons: string[];
};

/**
 * Les règles de décision vivent en TypeScript : le coach reçoit leur résultat plutôt que
 * de le recalculer, afin que son verdict et le badge affiché reposent sur la même mesure.
 */
export function buildFundCoachDiagnosticPayload(
  favorites: FundWatchlistEntry[],
  diagnostics: Map<string, FundDiagnostic>
): FundCoachDiagnosticPayload[] {
  const payload: FundCoachDiagnosticPayload[] = [];
  for (const entry of favorites) {
    const diagnostic = diagnostics.get(entry.isin);
    // Catégorie exclue (FCPR) : rien de fiable à transmettre, le coach garde ses heuristiques.
    if (!diagnostic) continue;
    payload.push({
      isin: entry.isin,
      status: diagnostic.status,
      delta_1an_vs_category: diagnostic.delta_1an_vs_category,
      delta_reference_label: diagnostic.delta_reference_label,
      trigger_reasons: diagnostic.trigger_reasons,
      reasons: diagnostic.reasons,
      context_reasons: diagnostic.context_reasons,
    });
  }
  return payload;
}
