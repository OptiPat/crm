import { Badge } from "@/components/ui/badge";
import type { FundDiagnostic } from "@/lib/fund-watchlist/fund-watchlist-diagnostic";
import {
  FUND_DIAGNOSTIC_STATUS_USER_LABELS,
  humanizeDiagnosticReason,
} from "@/lib/fund-watchlist/fund-watchlist-diagnostic-labels";
import { cn } from "@/lib/utils";

type Props = {
  diagnostic: FundDiagnostic;
  className?: string;
  compact?: boolean;
};

function statusClass(status: FundDiagnostic["status"]): string {
  switch (status) {
    case "conserver":
      return "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200";
    case "sous_surveillance":
      return "border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200";
    case "signal_arbitrage":
      return "border-rose-500/40 bg-rose-500/10 text-rose-900 dark:text-rose-200";
    case "inconnu":
      return "border-border bg-muted/50 text-muted-foreground";
  }
}

export function FundWatchlistDiagnosticBadge({ diagnostic, className, compact }: Props) {
  const title = [
    FUND_DIAGNOSTIC_STATUS_USER_LABELS[diagnostic.status],
    diagnostic.short_term_respiration ? "Respiration court terme (CT)" : null,
    // La référence n'est pas toujours la catégorie de marché : annoncer « vs catégorie » sur un
    // écart mesuré contre la médiane de la watchlist donnait plus de portée qu'il n'en a.
    diagnostic.delta_1an_vs_category != null
      ? `Écart 1 an vs ${diagnostic.delta_reference_label ?? "catégorie"} : ${diagnostic.delta_1an_vs_category > 0 ? "+" : ""}${diagnostic.delta_1an_vs_category} pt`
      : null,
    ...diagnostic.trigger_reasons.map(humanizeDiagnosticReason),
    ...diagnostic.context_reasons.map(humanizeDiagnosticReason),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)}>
      <Badge
        variant="outline"
        title={title}
        className={cn(
          "font-normal whitespace-nowrap",
          compact ? "text-[10px] px-1.5 py-0" : "text-[11px]",
          statusClass(diagnostic.status)
        )}
      >
        {compact
          ? FUND_DIAGNOSTIC_STATUS_USER_LABELS[diagnostic.status].replace(
              "À suivre",
              "Suivi"
            )
          : FUND_DIAGNOSTIC_STATUS_USER_LABELS[diagnostic.status]}
      </Badge>
      {diagnostic.short_term_respiration && diagnostic.status === "conserver" && (
        <Badge
          variant="outline"
          title="Score court terme négatif — respiration de marché, sans alerte fondamentale"
          className={cn(
            "font-normal whitespace-nowrap border-sky-500/40 bg-sky-500/10 text-sky-900 dark:text-sky-200",
            compact ? "text-[10px] px-1.5 py-0" : "text-[11px]"
          )}
        >
          Respiration CT
        </Badge>
      )}
    </div>
  );
}
