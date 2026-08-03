import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@/components/ui/table";
import { FileUp, FileDown, LineChart, RefreshCw, Scale, Search, Sparkles, Star, X, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import {
  getAllFundWatchlistEntries,
  getFundWatchlistCoachLastReport,
  setFundWatchlistFavorite,
  startFundWatchlistFavoritesReport,
  type FundWatchlistEntry,
  type FundWatchlistFavoritesReport,
} from "@/lib/api/tauri-fund-watchlist";
import { FundWatchlistImportDialog } from "@/components/fund-watchlist/FundWatchlistImportDialog";
import { FundWatchlistCoachDialog } from "@/components/fund-watchlist/FundWatchlistCoachDialog";
import { UcComparatorResults } from "@/components/fund-watchlist/UcComparatorResults";
import { UcComparatorPrintPortal } from "@/components/fund-watchlist/UcComparatorPrintPortal";
import { useUcComparatorPrintExport } from "@/hooks/useUcComparatorPrintExport";
import { Checkbox } from "@/components/ui/checkbox";
import { FundWatchlistColumnHeader } from "@/components/fund-watchlist/FundWatchlistColumnHeader";
import { FundWatchlistOptionalColumnToggles } from "@/components/fund-watchlist/FundWatchlistOptionalColumnToggles";
import { formatFundPerfPercent, formatFundSharpe, formatFundShortTermScore } from "@/lib/fund-watchlist/fund-watchlist-display";
import {
  collectFundWatchlistAnnualYears,
  fundWatchlistAnnualPerf,
} from "@/lib/fund-watchlist/fund-watchlist-annual-years";
import { subscribeFundWatchlistChanged } from "@/lib/fund-watchlist/fund-watchlist-events";
import { FUND_WATCHLIST_COACH_TOAST_ID } from "@/lib/fund-watchlist/fund-watchlist-coach-events";
import { formatCoachProgressLabel } from "@/lib/fund-watchlist/fund-watchlist-coach-progress";
import {
  consumeCoachOpenDialog,
  FUND_WATCHLIST_COACH_STORE_EVENT,
  loadCoachGenerating,
  loadCoachProgress,
  loadCoachReport,
  markCoachGenerationPending,
  saveCoachGenerating,
  saveCoachReport,
} from "@/lib/fund-watchlist/fund-watchlist-coach-store";
import { computeFundWatchlistShortTermScore } from "@/lib/fund-watchlist/fund-watchlist-short-term-score";
import {
  FUND_WATCHLIST_COLUMN_LABELS,
  FUND_WATCHLIST_COLUMN_ALIGN,
  FUND_WATCHLIST_DEFAULT_SORT,
  applyFundWatchlistTable,
  collectFundWatchlistDistinctValues,
  cycleFundWatchlistSort,
  fundWatchlistAnnualColumnKey,
  fundWatchlistCellAlignClass,
  isFundWatchlistAnnualColumnKey,
  type FundWatchlistColumnFilter,
  type FundWatchlistColumnFilters,
  type FundWatchlistColumnId,
  type FundWatchlistTableColumnKey,
  type FundWatchlistSort,
  type FundWatchlistSortDirection,
  columnFilterIsActive,
} from "@/lib/fund-watchlist/fund-watchlist-table";
import {
  FUND_WATCHLIST_ANNUAL_YEAR_MIN_WIDTH,
  FUND_WATCHLIST_CORE_COLUMNS,
  FUND_WATCHLIST_OPTIONAL_GROUPS,
  fundWatchlistColumnStyle,
  fundWatchlistOptionalColumns,
  type FundWatchlistOptionalColumnGroup,
} from "@/lib/fund-watchlist/fund-watchlist-table-layout";
import { cn } from "@/lib/utils";
import { runUcComparison, type CompareResponse } from "@/lib/api/tauri-uc-comparator";

const MAX_UC_COMPARE = 4;

type VeilleFondsProps = {
  onNavigate?: (page: string) => void;
};

type VeilleView = "table" | "compare";

type FilterMode = "all" | "favorites";

const DEFAULT_OPTIONAL_COLUMNS: Record<FundWatchlistOptionalColumnGroup, boolean> = {
  volatility: false,
  sharpe: false,
  sfdr: false,
};

export function VeilleFonds({ onNavigate: _onNavigate }: VeilleFondsProps) {
  const [entries, setEntries] = useState<FundWatchlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterMode>("all");
  const [importOpen, setImportOpen] = useState(false);
  const [coachOpen, setCoachOpen] = useState(false);
  const [coachReport, setCoachReport] = useState<FundWatchlistFavoritesReport | null>(() =>
    loadCoachReport()
  );
  const [coachGenerating, setCoachGenerating] = useState(() => loadCoachGenerating());
  const [coachProgress, setCoachProgress] = useState(() => loadCoachProgress());
  const [sort, setSort] = useState<FundWatchlistSort>(FUND_WATCHLIST_DEFAULT_SORT);
  const [columnFilters, setColumnFilters] = useState<FundWatchlistColumnFilters>({});
  const [expandedOptional, setExpandedOptional] = useState(DEFAULT_OPTIONAL_COLUMNS);
  const [selectedCompareIsins, setSelectedCompareIsins] = useState<Set<string>>(() => new Set());
  const [view, setView] = useState<VeilleView>("table");
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareResponse, setCompareResponse] = useState<CompareResponse | null>(null);
  const { printBundle: comparePrintBundle, printComparison, isPrinting: comparePrinting } =
    useUcComparatorPrintExport();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setEntries(await getAllFundWatchlistEntries());
    } catch (error) {
      toast.error(String(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return subscribeFundWatchlistChanged(() => void load());
  }, [load]);

  useEffect(() => {
    if (loadCoachReport()) return;
    void getFundWatchlistCoachLastReport()
      .then((report) => {
        if (!report) return;
        saveCoachReport(report);
        setCoachReport(report);
      })
      .catch(() => {
        // Base indisponible avant déverrouillage — ignoré.
      });
  }, []);

  useEffect(() => {
    const syncCoachFromStore = () => {
      setCoachReport(loadCoachReport());
      setCoachGenerating(loadCoachGenerating());
      setCoachProgress(loadCoachProgress());
      if (consumeCoachOpenDialog()) {
        setCoachOpen(true);
      }
    };
    syncCoachFromStore();
    window.addEventListener(FUND_WATCHLIST_COACH_STORE_EVENT, syncCoachFromStore);
    return () => window.removeEventListener(FUND_WATCHLIST_COACH_STORE_EVENT, syncCoachFromStore);
  }, []);

  const startCoachReport = async () => {
    const favoriteCount = entries.filter((e) => e.is_favorite).length;
    if (favoriteCount === 0) {
      toast.error("Épinglez au moins un fonds favori avant de générer le rapport.");
      return;
    }
    if (coachGenerating) {
      toast.info("Génération déjà en cours…");
      return;
    }
    setCoachGenerating(true);
    markCoachGenerationPending();
    toast.loading("Démarrage du rapport Coach…", { id: FUND_WATCHLIST_COACH_TOAST_ID });
    void startFundWatchlistFavoritesReport().catch((error: unknown) => {
      setCoachGenerating(false);
      saveCoachGenerating(false);
      toast.error(String(error), { id: FUND_WATCHLIST_COACH_TOAST_ID });
    });
  };

  const distinctByColumn = useMemo(() => {
    const map = new Map<FundWatchlistColumnId, string[]>();
    for (const column of ["favorite", "categorie", "sri", "sfdr"] as const) {
      map.set(column, collectFundWatchlistDistinctValues(entries, column));
    }
    return map;
  }, [entries]);

  const displayed = useMemo(() => {
    return applyFundWatchlistTable(entries, {
      search,
      favoritesOnly: filter === "favorites",
      columnFilters,
      sort,
    });
  }, [entries, search, filter, columnFilters, sort]);

  const activeFilterCount = useMemo(
    () => Object.values(columnFilters).filter(columnFilterIsActive).length,
    [columnFilters]
  );

  const stats = useMemo(() => {
    const favorites = entries.filter((e) => e.is_favorite).length;
    const lastImport = entries.reduce((max, e) => Math.max(max, e.updated_at), 0);
    return { total: entries.length, favorites, lastImport };
  }, [entries]);

  const annualYears = useMemo(() => collectFundWatchlistAnnualYears(entries), [entries]);
  const optionalColumns = useMemo(
    () => fundWatchlistOptionalColumns(expandedOptional),
    [expandedOptional]
  );
  const tableColumnCount =
    1 + FUND_WATCHLIST_CORE_COLUMNS.length + annualYears.length + optionalColumns.length;

  const selectedCompareCount = selectedCompareIsins.size;

  const toggleOptionalGroup = (group: FundWatchlistOptionalColumnGroup) => {
    const collapsing = expandedOptional[group];
    setExpandedOptional((prev) => ({ ...prev, [group]: !prev[group] }));
    if (!collapsing) return;

    const hiddenColumns = FUND_WATCHLIST_OPTIONAL_GROUPS[group].columns;
    setColumnFilters((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const column of hiddenColumns) {
        if (next[column]) {
          delete next[column];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    setSort((prev) => {
      if (!prev) return prev;
      if (isFundWatchlistAnnualColumnKey(prev.column)) return prev;
      return hiddenColumns.includes(prev.column) ? FUND_WATCHLIST_DEFAULT_SORT : prev;
    });
  };

  const toggleCompareSelection = (isin: string, checked: boolean) => {
    setSelectedCompareIsins((prev) => {
      const next = new Set(prev);
      if (checked) {
        if (next.size >= MAX_UC_COMPARE) {
          toast.error(`Maximum ${MAX_UC_COMPARE} fonds pour une comparaison.`);
          return prev;
        }
        next.add(isin);
      } else {
        next.delete(isin);
      }
      return next;
    });
  };

  const runCompare = async () => {
    const isins = [...selectedCompareIsins];
    if (isins.length < 2) {
      toast.error("Sélectionnez au moins 2 fonds à comparer.");
      return;
    }
    setView("compare");
    setCompareLoading(true);
    setCompareResponse(null);
    try {
      const result = await runUcComparison({ isins });
      setCompareResponse(result);
    } catch (error) {
      toast.error(String(error));
      setView("table");
    } finally {
      setCompareLoading(false);
    }
  };

  const toggleFavorite = async (entry: FundWatchlistEntry) => {
    try {
      await setFundWatchlistFavorite(entry.isin, !entry.is_favorite);
    } catch (error) {
      toast.error(String(error));
    }
  };

  const handleColumnFilterChange = (
    column: FundWatchlistTableColumnKey,
    next: FundWatchlistColumnFilter | undefined
  ) => {
    setColumnFilters((prev) => {
      const copy = { ...prev };
      if (!next || !columnFilterIsActive(next)) {
        delete copy[column];
      } else {
        copy[column] = next;
      }
      return copy;
    });
  };

  const clearTableFilters = () => {
    setSearch("");
    setColumnFilters({});
    setSort(FUND_WATCHLIST_DEFAULT_SORT);
    setFilter("all");
  };

  const isDefaultTableView =
    filter === "all" &&
    !search.trim() &&
    activeFilterCount === 0 &&
    sort?.column === FUND_WATCHLIST_DEFAULT_SORT.column &&
    sort?.direction === FUND_WATCHLIST_DEFAULT_SORT.direction;

  const coachButtonLabel = coachGenerating
    ? coachProgress
      ? formatCoachProgressLabel(coachProgress)
      : "Rapport en cours…"
    : coachReport
      ? "Voir rapport Coach"
      : "Rapport Coach";

  const renderFundWatchlistCell = (entry: FundWatchlistEntry, column: FundWatchlistColumnId) => {
    const alignClass = fundWatchlistCellAlignClass(column);
    if (column === "favorite") {
      return (
        <TableCell
          key={column}
          style={fundWatchlistColumnStyle(column)}
          className={cn("overflow-hidden px-0 py-1.5", alignClass)}
        >
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            aria-label={entry.is_favorite ? "Retirer des favoris" : "Ajouter aux favoris"}
            onClick={() => void toggleFavorite(entry)}
          >
            <Star
              className={cn(
                "h-3.5 w-3.5",
                entry.is_favorite ? "fill-amber-400 text-amber-500" : "text-muted-foreground"
              )}
            />
          </Button>
        </TableCell>
      );
    }
    if (column === "isin") {
      return (
        <TableCell
          key={column}
          style={fundWatchlistColumnStyle(column)}
          className={cn(
            "overflow-hidden px-1 py-1.5 font-mono text-[11px] leading-tight",
            alignClass
          )}
        >
          <span className="block truncate" title={entry.isin}>
            {entry.isin}
          </span>
        </TableCell>
      );
    }
    if (column === "nom") {
      return (
        <TableCell
          key={column}
          style={fundWatchlistColumnStyle(column)}
          className={cn("px-2 py-2 align-top whitespace-normal", alignClass)}
        >
          <span className="block break-words leading-snug">{entry.nom}</span>
        </TableCell>
      );
    }
    if (column === "categorie") {
      return (
        <TableCell
          key={column}
          style={fundWatchlistColumnStyle(column)}
          className={cn("px-1 py-1.5 text-muted-foreground whitespace-normal", alignClass)}
        >
          <span className="block break-words leading-snug" title={entry.categorie ?? undefined}>
            {entry.categorie ?? "—"}
          </span>
        </TableCell>
      );
    }
    if (column === "sri") {
      return (
        <TableCell
          key={column}
          style={fundWatchlistColumnStyle(column)}
          className={cn("px-1 py-1.5 tabular-nums", alignClass)}
        >
          {entry.sri ?? "—"}
        </TableCell>
      );
    }
    if (column === "score_ct") {
      const score = computeFundWatchlistShortTermScore(entry);
      return (
        <TableCell
          key={column}
          style={fundWatchlistColumnStyle(column)}
          className={cn(
            "px-1 py-1.5 tabular-nums text-[11px] whitespace-nowrap font-medium",
            alignClass,
            score == null && "text-muted-foreground"
          )}
          title={
            score == null
              ? "Les 4 horizons court terme sont requis (1 sem, 1 mois, 3 mois, YTD)"
              : undefined
          }
        >
          {formatFundShortTermScore(score)}
        </TableCell>
      );
    }
    if (column.startsWith("perf_") || column.startsWith("vol_")) {
      const value =
        column === "perf_ytd"
          ? entry.perf_ytd
          : column === "perf_1semaine"
            ? entry.perf_1semaine
            : column === "perf_1mois"
              ? entry.perf_1mois
              : column === "perf_3mois"
                ? entry.perf_3mois
                : column === "perf_1an"
                  ? entry.perf_1an
                  : column === "perf_3ans"
                    ? entry.perf_3ans
                    : column === "perf_5ans"
                      ? entry.perf_5ans
                      : column === "vol_5ans"
                        ? entry.vol_5ans
                        : column === "vol_3ans"
                          ? entry.vol_3ans
                          : entry.vol_1an;
      return (
        <TableCell
          key={column}
          style={fundWatchlistColumnStyle(column)}
          className={cn("px-1 py-1.5 tabular-nums text-[11px] whitespace-nowrap", alignClass)}
        >
          {formatFundPerfPercent(value)}
        </TableCell>
      );
    }
    if (column === "sharpe_ratio") {
      return (
        <TableCell
          key={column}
          style={fundWatchlistColumnStyle(column)}
          className={cn("px-1 py-1.5 tabular-nums text-[11px] whitespace-nowrap", alignClass)}
        >
          {formatFundSharpe(entry.sharpe_ratio)}
        </TableCell>
      );
    }
    return (
      <TableCell
        key={column}
        style={fundWatchlistColumnStyle(column)}
        className={cn("overflow-hidden pl-2 pr-1 py-1.5", alignClass)}
      >
        {entry.sfdr ? (
          <Badge
            variant="outline"
            className="inline-block max-w-full text-[10px] font-normal px-1.5 py-0 whitespace-normal leading-tight"
          >
            {entry.sfdr}
          </Badge>
        ) : (
          "—"
        )}
      </TableCell>
    );
  };

  const selectedCompareEntries = useMemo(
    () => entries.filter((e) => selectedCompareIsins.has(e.isin)),
    [entries, selectedCompareIsins]
  );

  const dialogs = (
    <>
      <FundWatchlistImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onApplied={() => void load()}
      />
      <FundWatchlistCoachDialog
        open={coachOpen}
        onOpenChange={setCoachOpen}
        report={coachReport}
      />
    </>
  );

  if (view === "compare") {
    return (
      <div className="space-y-6 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Button variant="ghost" size="sm" className="mb-2 -ml-2" onClick={() => setView("table")}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              Retour au tableau
            </Button>
            <h1 className="text-2xl font-serif font-bold flex items-center gap-2">
              <Scale className="h-7 w-7 text-primary" />
              Comparateur UC
            </h1>
            <p className="text-muted-foreground mt-1 max-w-2xl">
              Classement déterministe sur {selectedCompareEntries.length} fonds de même catégorie.
            </p>
            {selectedCompareEntries.length > 0 && (
              <ul className="mt-2 text-sm text-muted-foreground space-y-0.5">
                {selectedCompareEntries.map((e) => (
                  <li key={e.isin}>
                    <span className="font-mono text-xs">{e.isin}</span> — {e.nom}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => void runCompare()}
              disabled={selectedCompareCount < 2 || compareLoading}
            >
              <RefreshCw className={cn("h-4 w-4 mr-2", compareLoading && "animate-spin")} />
              Recalculer
            </Button>
            {compareResponse && (
              <Button
                variant="outline"
                onClick={() => void printComparison(compareResponse)}
                disabled={compareLoading || comparePrinting}
              >
                <FileDown className={cn("h-4 w-4 mr-2", comparePrinting && "animate-pulse")} />
                {comparePrinting ? "Export…" : "Exporter PDF"}
              </Button>
            )}
          </div>
        </div>

        <Card>
          <CardContent className="pt-6">
            {compareLoading && (
              <p className="text-sm text-muted-foreground">
                Calcul du score relatif… récupération composition Boursorama (Top 10) si nécessaire.
              </p>
            )}
            {!compareLoading && compareResponse && (
              <UcComparatorResults response={compareResponse} />
            )}
            {!compareLoading && !compareResponse && (
              <p className="text-sm text-muted-foreground">Aucun résultat disponible.</p>
            )}
          </CardContent>
        </Card>
        <UcComparatorPrintPortal printDoc={comparePrintBundle} />
        {dialogs}
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-serif font-bold flex items-center gap-2">
            <LineChart className="h-7 w-7 text-primary" />
            Veille fonds
          </h1>
          <p className="text-muted-foreground mt-1 max-w-2xl">
            Classement par score court terme (1 sem, 1 mois, 3 mois, YTD).
          </p>
        </div>
        <div className="flex flex-col items-start gap-1 sm:items-end">
          <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => void runCompare()}
            disabled={selectedCompareCount < 2 || compareLoading}
          >
            <Scale className="h-4 w-4 mr-2" />
            Comparer ({selectedCompareCount}/{MAX_UC_COMPARE})
          </Button>
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
            Actualiser
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              if (coachReport && !coachGenerating) {
                setCoachOpen(true);
              } else {
                void startCoachReport();
              }
            }}
            disabled={stats.favorites === 0 || coachGenerating}
          >
            <Sparkles className={cn("h-4 w-4 mr-2", coachGenerating && "animate-pulse")} />
            {coachButtonLabel}
          </Button>
          {!coachGenerating && coachReport && (
            <Button variant="outline" onClick={() => void startCoachReport()} disabled={stats.favorites === 0}>
              Régénérer
            </Button>
          )}
          <Button onClick={() => setImportOpen(true)}>
            <FileUp className="h-4 w-4 mr-2" />
            Importer Excel
          </Button>
          </div>
        {coachReport && !coachGenerating && (
          <p className="text-xs text-muted-foreground text-left sm:text-right">
            Dernier rapport Coach :{" "}
            {new Date(coachReport.generated_at * 1000).toLocaleString("fr-FR")} (
            {coachReport.favorite_count} fonds)
          </p>
        )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Fonds en base</CardDescription>
            <CardTitle className="text-2xl">{stats.total}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Favoris épinglés</CardDescription>
            <CardTitle className="text-2xl">{stats.favorites}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Dernière mise à jour</CardDescription>
            <CardTitle className="text-lg font-normal">
              {stats.lastImport > 0
                ? new Date(stats.lastImport * 1000).toLocaleString("fr-FR")
                : "—"}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-lg">Supports</CardTitle>
                <CardDescription>
                  {displayed.length} affiché(s) sur {entries.length}
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant={filter === "all" ? "secondary" : "outline"}
                  onClick={() => setFilter("all")}
                >
                  Tous
                </Button>
                <Button
                  size="sm"
                  variant={filter === "favorites" ? "secondary" : "outline"}
                  onClick={() => setFilter("favorites")}
                >
                  Favoris
                </Button>
                {!isDefaultTableView && (
                  <Button size="sm" variant="ghost" onClick={clearTableFilters}>
                    <X className="h-4 w-4 mr-1" />
                    Réinitialiser
                  </Button>
                )}
              </div>
            </div>
            <div className="relative w-full max-w-xl">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Rechercher parmi tous les fonds (ISIN, nom, catégorie, SRI, SFDR)…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <FundWatchlistOptionalColumnToggles
              expanded={expandedOptional}
              onToggle={toggleOptionalGroup}
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {entries.length === 0 && !loading ? (
            <div className="p-8 text-center text-muted-foreground">
              <p>Aucun fonds importé.</p>
              <Button className="mt-4" onClick={() => setImportOpen(true)}>
                <FileUp className="h-4 w-4 mr-2" />
                Importer votre fichier Cristalliance
              </Button>
            </div>
          ) : (
            <div className="max-h-[calc(100vh-22rem)] overflow-auto">
              <Table wrapperClassName="overflow-visible" className="!w-max table-fixed text-xs">
                <thead className="sticky top-0 z-10 bg-card [&_tr]:border-b">
                  <TableRow className="hover:bg-transparent">
                    <th
                      className="h-9 w-9 px-1 text-center text-[10px] font-medium text-muted-foreground"
                      title="Sélection pour comparateur (2 à 4 fonds)"
                    >
                      <Scale className="h-3.5 w-3.5 mx-auto opacity-60" aria-hidden />
                      <span className="sr-only">Comparer</span>
                    </th>
                    {FUND_WATCHLIST_CORE_COLUMNS.map((column) => (
                      <FundWatchlistColumnHeader
                        key={column}
                        column={column}
                        label={FUND_WATCHLIST_COLUMN_LABELS[column]}
                        align={FUND_WATCHLIST_COLUMN_ALIGN[column]}
                        className={
                          column === "nom"
                            ? "whitespace-normal"
                            : column === "categorie"
                              ? "whitespace-normal px-1"
                              : undefined
                        }
                        style={fundWatchlistColumnStyle(column)}
                        sort={sort}
                        filter={columnFilters[column]}
                        distinctValues={distinctByColumn.get(column)}
                        onCycleSort={(col) => setSort((prev) => cycleFundWatchlistSort(prev, col))}
                        onSetSort={(col, direction: FundWatchlistSortDirection) =>
                          setSort({ column: col, direction })
                        }
                        onFilterChange={handleColumnFilterChange}
                      />
                    ))}
                    {annualYears.map((year) => {
                      const column = fundWatchlistAnnualColumnKey(year);
                      return (
                        <FundWatchlistColumnHeader
                          key={column}
                          column={column}
                          label={year}
                          align="right"
                          style={{
                            minWidth: FUND_WATCHLIST_ANNUAL_YEAR_MIN_WIDTH,
                            width: FUND_WATCHLIST_ANNUAL_YEAR_MIN_WIDTH,
                          }}
                          sort={sort}
                          filter={columnFilters[column]}
                          onCycleSort={(col) =>
                            setSort((prev) => cycleFundWatchlistSort(prev, col))
                          }
                          onSetSort={(col, direction: FundWatchlistSortDirection) =>
                            setSort({ column: col, direction })
                          }
                          onFilterChange={handleColumnFilterChange}
                        />
                      );
                    })}
                    {optionalColumns.map((column) => (
                      <FundWatchlistColumnHeader
                        key={column}
                        column={column}
                        label={FUND_WATCHLIST_COLUMN_LABELS[column]}
                        align={FUND_WATCHLIST_COLUMN_ALIGN[column]}
                        className={column === "sfdr" ? "pl-2" : undefined}
                        style={fundWatchlistColumnStyle(column)}
                        sort={sort}
                        filter={columnFilters[column]}
                        distinctValues={distinctByColumn.get(column)}
                        onCycleSort={(col) => setSort((prev) => cycleFundWatchlistSort(prev, col))}
                        onSetSort={(col, direction: FundWatchlistSortDirection) =>
                          setSort({ column: col, direction })
                        }
                        onFilterChange={handleColumnFilterChange}
                      />
                    ))}
                  </TableRow>
                </thead>
                <TableBody>
                  {displayed.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={tableColumnCount}
                        className="h-24 text-center text-muted-foreground"
                      >
                        Aucun fonds ne correspond à votre recherche ou vos filtres.
                      </TableCell>
                    </TableRow>
                  ) : (
                    displayed.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell className="w-9 px-1 py-1.5 text-center">
                          <Checkbox
                            checked={selectedCompareIsins.has(entry.isin)}
                            onCheckedChange={(checked) =>
                              toggleCompareSelection(entry.isin, checked === true)
                            }
                            aria-label={`Comparer ${entry.nom}`}
                          />
                        </TableCell>
                        {FUND_WATCHLIST_CORE_COLUMNS.map((column) =>
                          renderFundWatchlistCell(entry, column)
                        )}
                        {annualYears.map((year) => (
                          <TableCell
                            key={`${entry.id}-annual-${year}`}
                            style={{
                              minWidth: FUND_WATCHLIST_ANNUAL_YEAR_MIN_WIDTH,
                              width: FUND_WATCHLIST_ANNUAL_YEAR_MIN_WIDTH,
                            }}
                            className="px-1 py-1.5 text-right tabular-nums text-[11px] whitespace-nowrap"
                          >
                            {formatFundPerfPercent(fundWatchlistAnnualPerf(entry, year))}
                          </TableCell>
                        ))}
                        {optionalColumns.map((column) =>
                          renderFundWatchlistCell(entry, column)
                        )}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {dialogs}
    </div>
  );
}
