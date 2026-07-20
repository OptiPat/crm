import { useCallback, useState } from "react";
import {
  ChevronsDownUp,
  ChevronsUpDown,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  collapseAllStatistiquesPanels,
  expandAllStatistiquesPanels,
} from "@/lib/statistiques/statistiques-page-preferences";
import {
  STATISTIQUES_SECTIONS,
  statistiquesSectionAnchorId,
} from "@/lib/statistiques/statistiques-sections";
import type { StatistiquesSectionId } from "@/lib/statistiques/statistiques-page-preferences";
import { cn } from "@/lib/utils";
import { useStatistiquesPageData } from "./statistiques-page-data-context";

function formatLastUpdated(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function StatistiquesPageToolbar() {
  const { loading, lastUpdatedAt, refreshData } = useStatistiquesPageData();
  const [refreshing, setRefreshing] = useState(false);
  const [panelsVersion, setPanelsVersion] = useState(0);

  const scrollToSection = useCallback((sectionId: StatistiquesSectionId) => {
    document.getElementById(statistiquesSectionAnchorId(sectionId))?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshData();
    } finally {
      setRefreshing(false);
    }
  }, [refreshData]);

  const handleExpandAll = useCallback(() => {
    expandAllStatistiquesPanels();
    setPanelsVersion((v) => v + 1);
    window.dispatchEvent(new CustomEvent("statistiques-panels-reset"));
  }, []);

  const handleCollapseAll = useCallback(() => {
    collapseAllStatistiquesPanels();
    setPanelsVersion((v) => v + 1);
    window.dispatchEvent(new CustomEvent("statistiques-panels-reset"));
  }, []);

  return (
    <div className="sticky top-0 z-20 -mx-1 space-y-3 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 pb-3 pt-1 border-b border-border/60">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <nav
          className="flex gap-1.5 overflow-x-auto pb-0.5 -mx-1 px-1 scrollbar-thin"
          aria-label="Sections statistiques"
        >
          {STATISTIQUES_SECTIONS.map((section) => (
            <button
              key={section.id}
              type="button"
              onClick={() => scrollToSection(section.id)}
              className={cn(
                "shrink-0 rounded-lg border border-border/60 bg-card px-3 py-1.5 text-xs font-medium",
                "hover:bg-muted/50 transition-colors text-left"
              )}
            >
              <span className="text-foreground">{section.title}</span>
              <span className="ml-1.5 text-muted-foreground tabular-nums">({section.panelCount})</span>
            </button>
          ))}
        </nav>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {lastUpdatedAt ? (
            <span className="text-xs text-muted-foreground tabular-nums">
              Mis à jour à {formatLastUpdated(lastUpdatedAt)}
            </span>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            disabled={loading || refreshing}
            onClick={() => void handleRefresh()}
          >
            {refreshing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            )}
            Actualiser
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            onClick={handleExpandAll}
            key={`expand-${panelsVersion}`}
          >
            <ChevronsUpDown className="h-3.5 w-3.5" aria-hidden />
            Tout ouvrir
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            onClick={handleCollapseAll}
            key={`collapse-${panelsVersion}`}
          >
            <ChevronsDownUp className="h-3.5 w-3.5" aria-hidden />
            Tout replier
          </Button>
        </div>
      </div>
    </div>
  );
}
