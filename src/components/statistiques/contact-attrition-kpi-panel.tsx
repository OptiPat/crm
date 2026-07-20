import { ChevronRight } from "lucide-react";
import type { ContactAttritionStatResult } from "@/lib/statistiques/contact-attrition-stats";
import { ChartEmpty, ChartLoading } from "@/components/dashboard/dashboard-ui";
import { cn } from "@/lib/utils";
import { StatistiquesPanel } from "./statistiques-ui";
import type { StatistiquesPanelId } from "@/lib/statistiques/statistiques-page-preferences";

function formatAttritionSubtitle(stats: ContactAttritionStatResult): string {
  const pct = stats.attritionPercent.toFixed(1).replace(".0", "");
  return `${stats.attritedCount}/${stats.totalCount} soit ${pct} % d'attrition`;
}

function AttritionListButton({
  label,
  count,
  onClick,
}: {
  label: string;
  count: number;
  onClick: () => void;
}) {
  const interactive = count > 0;
  return (
    <button
      type="button"
      disabled={!interactive}
      onClick={interactive ? onClick : undefined}
      className={cn(
        "flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-background px-3 py-2.5 text-left",
        interactive && "hover:bg-muted/40 cursor-pointer transition-colors"
      )}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium truncate">{label}</p>
        <p className="text-xs text-muted-foreground tabular-nums">{count} contact{count > 1 ? "s" : ""}</p>
      </div>
      {interactive ? (
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      ) : null}
    </button>
  );
}

type AttritionKpiPanelProps = {
  panelId: StatistiquesPanelId;
  title: string;
  description: string;
  loading: boolean;
  stats: ContactAttritionStatResult;
  activeLabel: string;
  attritedLabel: string;
  hint: string;
  onOpenList: (kind: "active" | "attrited") => void;
};

export function AttritionKpiPanel({
  panelId,
  title,
  description,
  loading,
  stats,
  activeLabel,
  attritedLabel,
  hint,
  onOpenList,
}: AttritionKpiPanelProps) {
  const pctLabel = stats.attritionPercent.toFixed(1).replace(".0", "");

  return (
    <StatistiquesPanel title={title} description={description} collapsible panelId={panelId}>
      {loading ? (
        <ChartLoading />
      ) : stats.totalCount === 0 ? (
        <ChartEmpty title="Aucun contact éligible pour cette statistique." height={180} />
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Attrition</p>
              <p className="text-3xl font-serif font-bold tabular-nums tracking-tight mt-0.5 text-primary">
                {pctLabel} %
              </p>
            </div>
            <p className="text-xs text-muted-foreground text-right max-w-xs">{formatAttritionSubtitle(stats)}</p>
          </div>

          <p className="text-xs text-muted-foreground">{hint}</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <AttritionListButton
              label={activeLabel}
              count={stats.activeCount}
              onClick={() => onOpenList("active")}
            />
            <AttritionListButton
              label={attritedLabel}
              count={stats.attritedCount}
              onClick={() => onOpenList("attrited")}
            />
          </div>
        </div>
      )}
    </StatistiquesPanel>
  );
}
