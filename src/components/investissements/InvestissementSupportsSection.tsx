import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  listContratSupports,
  type ContratSupportLine,
} from "@/lib/api/tauri-contrat-supports";
import {
  formatFundEncours,
  formatFundPerfPercent,
  fundPerfSignTextClass,
} from "@/lib/fund-watchlist/fund-watchlist-display";
import { cn } from "@/lib/utils";

/**
 * Composition réelle du contrat, issue de l'import des positions clients.
 *
 * Lecture seule et volontairement à côté de la valorisation du contrat : les deux n'ont ni la
 * même source ni la même date, et les faire écrire au même endroit rendrait invisible celle qui
 * a raison. Sans position importée pour ce contrat, le composant ne rend rien.
 */
export function InvestissementSupportsSection({
  investissementId,
}: {
  investissementId: number;
}) {
  const [lines, setLines] = useState<ContratSupportLine[]>([]);

  useEffect(() => {
    let active = true;
    listContratSupports(investissementId)
      .then((rows) => {
        if (active) setLines(rows);
      })
      .catch(() => {
        if (active) setLines([]);
      });
    return () => {
      active = false;
    };
  }, [investissementId]);

  if (lines.length === 0) return null;

  const total = lines.reduce((sum, line) => sum + (line.encours ?? 0), 0);
  const dateValeur = lines.find((line) => line.date_valeur != null)?.date_valeur ?? null;

  return (
    <details
      className="group mt-2 rounded-md border border-border/70 bg-muted/20"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground">
        <ChevronDown className="h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-180" />
        <span>
          Composition : {lines.length} support(s) — {formatFundEncours(total)}
          {dateValeur != null &&
            ` au ${new Date(dateValeur * 1000).toLocaleDateString("fr-FR", { timeZone: "UTC" })}`}
        </span>
      </summary>
      <ul className="space-y-1 px-2.5 pb-2">
        {lines.map((line) => {
          const poids = total > 0 ? ((line.encours ?? 0) / total) * 100 : null;
          return (
            <li
              key={line.isin}
              className="flex items-baseline justify-between gap-2 text-xs border-t border-border/50 pt-1"
            >
              <span className="min-w-0 flex-1 truncate" title={`${line.libelle} — ${line.isin}`}>
                {line.libelle}
                {poids != null && (
                  <span className="ml-1 text-muted-foreground">
                    {poids.toFixed(0)}&nbsp;%
                  </span>
                )}
              </span>
              <span className="shrink-0 tabular-nums">{formatFundEncours(line.encours)}</span>
              <span
                className={cn(
                  "w-16 shrink-0 text-right tabular-nums",
                  fundPerfSignTextClass(line.plus_moins_value_pct)
                )}
              >
                {formatFundPerfPercent(line.plus_moins_value_pct)}
              </span>
            </li>
          );
        })}
      </ul>
    </details>
  );
}
