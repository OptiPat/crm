import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { CompareResponse, UcFundResultScore } from "@/lib/api/tauri-uc-comparator";
import {
  buildUcComparisonNarrative,
  criterionHelpText,
  formatCriterionRawValue,
  formatCriterionWeightLabel,
  fundsInRankOrder,
  isCriteriaWeightRenormalized,
  metricsForIsin,
  resolveCriterionWinners,
  scoreForFundOnCriterion,
} from "@/lib/fund-watchlist/uc-comparator-summary";
import { cn } from "@/lib/utils";
import { Check, Minus } from "lucide-react";

function verdictLabel(verdict: CompareResponse["verdict"]): string {
  switch (verdict) {
    case "WINNER_DECLARED":
      return "Recommandation";
    case "TIE":
      return "Égalité";
    case "INSUFFICIENT_DATA":
      return "Données insuffisantes";
    case "CATEGORY_MISMATCH":
      return "Catégories différentes";
    default:
      return verdict;
  }
}

function FundAlerts({ fund }: { fund: UcFundResultScore }) {
  if (!fund.alerts?.length) return null;
  return (
    <ul className="space-y-1 text-xs text-amber-700 dark:text-amber-400">
      {fund.alerts.map((alert, i) => (
        <li key={i}>{alert}</li>
      ))}
    </ul>
  );
}

type Props = {
  response: CompareResponse;
  className?: string;
};

export function UcComparatorResults({ response, className }: Props) {
  const ranked = fundsInRankOrder(response.results ?? []);
  const winner = ranked.find((f) => f.isin === response.winner_isin);
  const narrative = buildUcComparisonNarrative(response);
  const criterionWinners = resolveCriterionWinners(response);

  if (ranked.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Aucun fonds dans la réponse — vérifiez que les ISIN sont bien en watchlist.
      </p>
    );
  }

  return (
    <div className={cn("space-y-6", className)}>
      <div className="rounded-lg border bg-muted/20 p-4 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{verdictLabel(response.verdict)}</Badge>
          {response.category && (
            <span className="text-xs text-muted-foreground">{response.category}</span>
          )}
        </div>
        {narrative && <p className="text-sm leading-relaxed">{narrative}</p>}
        <p className="text-xs text-muted-foreground">
          Chaque critère est noté de 0 à 100 dans le groupe (100 = meilleur). Le Sharpe compte le
          plus (45 % nominal en v1). Si un critère manque (ex. Top 10), son poids est redistribué —
          le total reste sur 100.
        </p>
        {isCriteriaWeightRenormalized(response.criteria) && (
          <p className="text-xs text-muted-foreground">
            Les poids « effectifs » du tableau tiennent compte de cette redistribution.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium">Classement</h3>
        <div className="space-y-3">
          {ranked.map((fund) => {
            const isWinner = fund.isin === response.winner_isin;
            return (
              <div
                key={fund.isin}
                className={cn(
                  "rounded-lg border px-4 py-3 flex flex-wrap items-start justify-between gap-3",
                  isWinner && "border-primary/50 bg-primary/5"
                )}
              >
                <div className="min-w-0">
                  <p className="font-medium">
                    {fund.rank === 1 ? "1er — " : `${fund.rank}e — `}
                    {fund.nom}
                  </p>
                  <p className="text-xs text-muted-foreground font-mono">{fund.isin}</p>
                  <div className="mt-2">
                    <FundAlerts fund={fund} />
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-semibold tabular-nums">
                    {fund.score_relative_total.toFixed(1)}
                    <span className="text-sm font-normal text-muted-foreground"> / 100</span>
                  </p>
                  {isWinner && response.score_gap != null && response.score_gap > 0 && (
                    <p className="text-xs text-muted-foreground">
                      +{response.score_gap.toFixed(1)} pts d&apos;avance
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {response.criteria.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Détail critère par critère</h3>
          <p className="text-xs text-muted-foreground">
            Valeurs réelles (watchlist) et score relatif dans le groupe. Le critère le plus
            influent est en gras.
          </p>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[140px]">Critère</TableHead>
                  {ranked.map((fund) => (
                    <TableHead key={fund.isin} className="text-right min-w-[120px]">
                      {fund.nom.split(" ").slice(0, 2).join(" ")}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {criterionWinners.map(({ criterion, winnerIsin, tie }) => {
                  const isTopWeight =
                    criterion.available &&
                    criterion.weight_global ===
                      Math.max(
                        ...response.criteria.filter((c) => c.available).map((c) => c.weight_global)
                      );
                  return (
                    <TableRow
                      key={criterion.key}
                      className={cn(!criterion.available && "opacity-50")}
                    >
                      <TableCell className="text-xs align-top">
                        <span className={cn(isTopWeight && "font-semibold")}>{criterion.label}</span>
                        <span className="block text-muted-foreground">
                          {formatCriterionWeightLabel(criterion, response.criteria)}
                        </span>
                        {criterionHelpText(criterion.key) && (
                          <span className="block text-muted-foreground mt-1 max-w-[200px]">
                            {criterionHelpText(criterion.key)}
                          </span>
                        )}
                      </TableCell>
                      {ranked.map((fund) => {
                        const relScore = scoreForFundOnCriterion(
                          criterion,
                          response.fund_order ?? [],
                          fund.isin
                        );
                        const raw = formatCriterionRawValue(
                          criterion.key,
                          metricsForIsin(response.metrics ?? [], fund.isin)
                        );
                        const isLeader = criterion.available && winnerIsin === fund.isin;
                        const isTie = criterion.available && tie;
                        return (
                          <TableCell key={fund.isin} className="text-right text-xs">
                            <div className="flex items-center justify-end gap-1">
                              {criterion.available && isLeader && (
                                <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                              )}
                              {criterion.available && isTie && (
                                <Minus className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              )}
                              <span className="tabular-nums font-medium">{raw}</span>
                            </div>
                            {criterion.available && relScore != null && (
                              <span className="text-muted-foreground tabular-nums">
                                score {relScore.toFixed(0)}/100
                              </span>
                            )}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {response.verdict === "TIE" && (
        <p className="text-xs text-muted-foreground">
          Confiance {Math.round((response.confidence_index ?? 0) * 100)} % — moteur{" "}
          {response.scoring_version}. Scores très proches : pas de recommandation automatique.
        </p>
      )}

      {response.verdict === "WINNER_DECLARED" && winner && (
        <p className="text-xs text-muted-foreground">
          Confiance {Math.round((response.confidence_index ?? 0) * 100)} % — moteur{" "}
          {response.scoring_version}. Ce score aide à arbitrer entre fonds comparables ; il ne
          remplace pas l&apos;analyse patrimoniale globale.
        </p>
      )}
    </div>
  );
}
