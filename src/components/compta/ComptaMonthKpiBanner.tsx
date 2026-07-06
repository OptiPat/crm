import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  ComptaDepense,
  ComptaDeplacement,
  ComptaEncaissement,
} from "@/lib/api/tauri-compta";
import {
  computeComptaJournalTotals,
  type ComptaKpiTargetTab,
} from "@/lib/compta/compta-journal";
import { formatComptaMoney } from "@/lib/compta/compta-money";
import { cn } from "@/lib/utils";

interface ComptaMonthKpiBannerProps {
  depenses: ComptaDepense[];
  encaissements: ComptaEncaissement[];
  deplacements: ComptaDeplacement[];
  onNavigateTab?: (tab: ComptaKpiTargetTab) => void;
}

const KPI_CARDS: Array<{
  label: string;
  tab: ComptaKpiTargetTab;
  valueClassName: string;
  cardClassName: string;
}> = [
  {
    label: "Encaissements",
    tab: "encaissements",
    valueClassName: "text-emerald-600",
    cardClassName: "border-l-4 border-l-emerald-500",
  },
  {
    label: "Dépenses",
    tab: "depenses",
    valueClassName: "text-red-600",
    cardClassName: "border-l-4 border-l-red-500",
  },
  {
    label: "Indemnités km",
    tab: "deplacements",
    valueClassName: "text-blue-600",
    cardClassName: "border-l-4 border-l-blue-500",
  },
  {
    label: "TVA nette",
    tab: "journal",
    valueClassName: "",
    cardClassName: "",
  },
];

export function ComptaMonthKpiBanner({
  depenses,
  encaissements,
  deplacements,
  onNavigateTab,
}: ComptaMonthKpiBannerProps) {
  const totals = computeComptaJournalTotals(encaissements, depenses, deplacements);

  const values: Record<ComptaKpiTargetTab, string> = {
    encaissements: formatComptaMoney(totals.totalEnc),
    depenses: formatComptaMoney(totals.totalDep),
    deplacements: formatComptaMoney(totals.totalKm),
    journal: formatComptaMoney(totals.totalTVA),
  };

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {KPI_CARDS.map((c) => {
        const interactive = Boolean(onNavigateTab);
        return (
          <Card
            key={c.label}
            role={interactive ? "button" : undefined}
            tabIndex={interactive ? 0 : undefined}
            title={interactive ? `Voir ${c.label.toLowerCase()}` : undefined}
            className={cn(
              c.cardClassName,
              interactive &&
                "cursor-pointer transition-colors hover:border-primary/40 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            )}
            onClick={interactive ? () => onNavigateTab?.(c.tab) : undefined}
            onKeyDown={
              interactive
                ? (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onNavigateTab?.(c.tab);
                    }
                  }
                : undefined
            }
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {c.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className={cn("text-xl font-semibold tabular-nums", c.valueClassName)}>
                {values[c.tab]}
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
