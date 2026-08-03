import { Button } from "@/components/ui/button";
import type { FundWatchlistEntry } from "@/lib/api/tauri-fund-watchlist";
import { FundWatchlistDiagnosticBadge } from "@/components/fund-watchlist/FundWatchlistDiagnosticBadge";
import {
  countDiagnosticsByStatus,
  sortEntriesByDiagnosticPriority,
  type FundDiagnostic,
  type FundDiagnosticStatus,
} from "@/lib/fund-watchlist/fund-watchlist-diagnostic";
import {
  FUND_DIAGNOSTIC_STATUS_USER_LABELS,
  humanizeDiagnosticReason,
} from "@/lib/fund-watchlist/fund-watchlist-diagnostic-labels";
import { useMemo, useState } from "react";

type Props = {
  entries: FundWatchlistEntry[];
  diagnostics: Map<string, FundDiagnostic>;
};

const STATUS_ORDER: FundDiagnosticStatus[] = [
  "signal_arbitrage",
  "sous_surveillance",
  "inconnu",
  "conserver",
];

function DiagnosticChecklist({ diagnostic }: { diagnostic: FundDiagnostic }) {
  if (diagnostic.status === "conserver") return null;

  return (
    <ul className="mt-2 space-y-1 text-[11px] text-muted-foreground list-disc pl-4">
      <li>Comparer aux pairs (Comparateur UC)</li>
      <li>Vérifier style / exposition (matrice Boursorama)</li>
      <li>Contrôler horizons 1 mois, 3 mois, YTD, 3 ans et 5 ans</li>
      <li>Relier la baisse au Top 10 (rapport Coach)</li>
      <li className="list-none pl-0 text-[10px] italic">
        Renforcer ou arbitrer : décision dossier client (SRI, trésorerie, pondération).
      </li>
    </ul>
  );
}

export function FundWatchlistCoachDiagnosticPanel({ entries, diagnostics }: Props) {
  const [expandedIsin, setExpandedIsin] = useState<string | null>(null);

  const favoriteDiagnostics = useMemo(() => {
    const map = new Map<string, FundDiagnostic>();
    for (const entry of entries) {
      const diagnostic = diagnostics.get(entry.isin);
      if (diagnostic) map.set(entry.isin, diagnostic);
    }
    return map;
  }, [entries, diagnostics]);

  const counts = useMemo(
    () => countDiagnosticsByStatus(favoriteDiagnostics),
    [favoriteDiagnostics]
  );
  const prioritized = useMemo(
    () => sortEntriesByDiagnosticPriority(entries, favoriteDiagnostics),
    [entries, favoriteDiagnostics]
  );

  const attention = prioritized.filter((e) => {
    const s = favoriteDiagnostics.get(e.isin)?.status;
    return s === "sous_surveillance" || s === "signal_arbitrage";
  });

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div>
        <h3 className="text-sm font-medium">Lecture patrimoniale — favoris</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Règles CRM recalculées à chaque import. « À suivre » si écart vs catégorie, faiblesse sur
          plusieurs horizons ou correction 1 mois. Sharpe ≤ 0 ne déclenche pas seul : il renforce
          l'argumentaire sur un fonds déjà en alerte. Le score CT négatif seul affiche « Respiration CT ».
        </p>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        {STATUS_ORDER.map((status) => (
          <span key={status} className="text-muted-foreground">
            {FUND_DIAGNOSTIC_STATUS_USER_LABELS[status]} :{" "}
            <span className="font-medium text-foreground">{counts[status]}</span>
          </span>
        ))}
      </div>

      {attention.length > 0 ? (
        <div className="space-y-2 max-h-[min(40vh,320px)] overflow-y-auto">
          {attention.map((entry) => {
            const diagnostic = favoriteDiagnostics.get(entry.isin);
            if (!diagnostic) return null;
            const open = expandedIsin === entry.isin;
            return (
              <div key={entry.isin} className="rounded-md border px-3 py-2 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium leading-snug break-words">{entry.nom}</p>
                    <p className="text-[11px] text-muted-foreground font-mono">{entry.isin}</p>
                  </div>
                  <FundWatchlistDiagnosticBadge diagnostic={diagnostic} compact />
                </div>
                {diagnostic.trigger_reasons.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    <span className="font-medium text-foreground">Pourquoi : </span>
                    {diagnostic.trigger_reasons.map(humanizeDiagnosticReason).join(" · ")}
                  </p>
                )}
                {diagnostic.context_reasons.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    <span className="font-medium text-foreground">Contexte : </span>
                    {diagnostic.context_reasons.map(humanizeDiagnosticReason).join(" · ")}
                  </p>
                )}
                {diagnostic.trigger_reasons.length === 0 &&
                  diagnostic.context_reasons.length === 0 &&
                  diagnostic.reasons.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {diagnostic.reasons.join(" · ")}
                    </p>
                  )}
                <div className="flex flex-wrap gap-2 mt-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setExpandedIsin(open ? null : entry.isin)}
                  >
                    {open ? "Masquer checklist" : "Checklist conseiller"}
                  </Button>
                </div>
                {open && <DiagnosticChecklist diagnostic={diagnostic} />}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Aucun fonds en surveillance ou signal arbitrage parmi vos favoris.
        </p>
      )}
    </div>
  );
}
