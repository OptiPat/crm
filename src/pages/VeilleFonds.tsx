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
import { FileUp, LineChart, RefreshCw, Search, Sparkles, Star, X } from "lucide-react";
import { toast } from "sonner";
import {
  getAllFundWatchlistEntries,
  setFundWatchlistFavorite,
  startFundWatchlistFavoritesReport,
  type FundWatchlistEntry,
  type FundWatchlistFavoritesReport,
} from "@/lib/api/tauri-fund-watchlist";
import { FundWatchlistImportDialog } from "@/components/fund-watchlist/FundWatchlistImportDialog";
import { FundWatchlistCoachDialog } from "@/components/fund-watchlist/FundWatchlistCoachDialog";
import { FundWatchlistColumnHeader } from "@/components/fund-watchlist/FundWatchlistColumnHeader";
import { formatFundPerfPercent, formatFundShortTermScore } from "@/lib/fund-watchlist/fund-watchlist-display";
import { subscribeFundWatchlistChanged } from "@/lib/fund-watchlist/fund-watchlist-events";
import { FUND_WATCHLIST_COACH_TOAST_ID } from "@/lib/fund-watchlist/fund-watchlist-coach-events";
import {
  consumeCoachOpenDialog,
  FUND_WATCHLIST_COACH_STORE_EVENT,
  loadCoachGenerating,
  loadCoachReport,
  markCoachGenerationPending,
  saveCoachGenerating,
} from "@/lib/fund-watchlist/fund-watchlist-coach-store";
import { computeFundWatchlistShortTermScore } from "@/lib/fund-watchlist/fund-watchlist-short-term-score";
import {
  FUND_WATCHLIST_COLUMN_LABELS,
  FUND_WATCHLIST_COLUMN_ALIGN,
  FUND_WATCHLIST_DEFAULT_SORT,
  applyFundWatchlistTable,
  collectFundWatchlistDistinctValues,
  cycleFundWatchlistSort,
  fundWatchlistCellAlignClass,
  type FundWatchlistColumnFilter,
  type FundWatchlistColumnFilters,
  type FundWatchlistColumnId,
  type FundWatchlistSort,
  type FundWatchlistSortDirection,
  columnFilterIsActive,
} from "@/lib/fund-watchlist/fund-watchlist-table";
import { cn } from "@/lib/utils";

type VeilleFondsProps = {
  onNavigate?: (page: string) => void;
};

type FilterMode = "all" | "favorites";

const COLUMN_WIDTHS: Record<FundWatchlistColumnId, string> = {
  favorite: "44px",
  isin: "88px",
  nom: "14%",
  categorie: "9%",
  sri: "32px",
  score_ct: "52px",
  perf_ytd: "6.5%",
  perf_1semaine: "6.5%",
  perf_1mois: "6.5%",
  perf_3mois: "6.5%",
  perf_1an: "7%",
  perf_3ans: "6.5%",
  perf_5ans: "6.5%",
  sfdr: "88px",
};

const DATA_COLUMNS: FundWatchlistColumnId[] = [
  "favorite",
  "isin",
  "nom",
  "categorie",
  "sri",
  "score_ct",
  "perf_ytd",
  "perf_1semaine",
  "perf_1mois",
  "perf_3mois",
  "perf_1an",
  "perf_3ans",
  "perf_5ans",
  "sfdr",
];

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
  const [sort, setSort] = useState<FundWatchlistSort>(FUND_WATCHLIST_DEFAULT_SORT);
  const [columnFilters, setColumnFilters] = useState<FundWatchlistColumnFilters>({});

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
    const syncCoachFromStore = () => {
      setCoachReport(loadCoachReport());
      setCoachGenerating(loadCoachGenerating());
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
    toast.loading("Rapport Coach en cours…", { id: FUND_WATCHLIST_COACH_TOAST_ID });
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

  const toggleFavorite = async (entry: FundWatchlistEntry) => {
    try {
      await setFundWatchlistFavorite(entry.isin, !entry.is_favorite);
    } catch (error) {
      toast.error(String(error));
    }
  };

  const handleColumnFilterChange = (
    column: FundWatchlistColumnId,
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
        <div className="flex flex-wrap gap-2">
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
            {coachGenerating ? "Rapport en cours…" : coachReport ? "Voir rapport Coach" : "Rapport Coach"}
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
            <div className="max-h-[calc(100vh-22rem)] overflow-y-auto overflow-x-hidden">
              <Table
                wrapperClassName="overflow-visible"
                className="table-fixed w-full text-xs"
              >
                <colgroup>
                  {DATA_COLUMNS.map((column) => (
                    <col key={column} style={{ width: COLUMN_WIDTHS[column] }} />
                  ))}
                </colgroup>
                <thead className="sticky top-0 z-10 bg-card [&_tr]:border-b">
                  <TableRow className="hover:bg-transparent">
                    {DATA_COLUMNS.map((column) => (
                      <FundWatchlistColumnHeader
                        key={column}
                        column={column}
                        label={FUND_WATCHLIST_COLUMN_LABELS[column]}
                        align={FUND_WATCHLIST_COLUMN_ALIGN[column]}
                        className={column === "sfdr" ? "pl-2" : undefined}
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
                        colSpan={DATA_COLUMNS.length}
                        className="h-24 text-center text-muted-foreground"
                      >
                        Aucun fonds ne correspond à votre recherche ou vos filtres.
                      </TableCell>
                    </TableRow>
                  ) : (
                    displayed.map((entry) => (
                      <TableRow key={entry.id}>
                        {DATA_COLUMNS.map((column) => {
                          const alignClass = fundWatchlistCellAlignClass(column);
                          if (column === "favorite") {
                            return (
                              <TableCell
                                key={column}
                                className={cn("overflow-hidden px-0 py-1.5", alignClass)}
                              >
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 shrink-0"
                                  aria-label={
                                    entry.is_favorite
                                      ? "Retirer des favoris"
                                      : "Ajouter aux favoris"
                                  }
                                  onClick={() => void toggleFavorite(entry)}
                                >
                                  <Star
                                    className={cn(
                                      "h-3.5 w-3.5",
                                      entry.is_favorite
                                        ? "fill-amber-400 text-amber-500"
                                        : "text-muted-foreground"
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
                          if (column === "nom" || column === "categorie") {
                            const value = column === "nom" ? entry.nom : entry.categorie;
                            return (
                              <TableCell
                                key={column}
                                className={cn(
                                  "overflow-hidden px-1 py-1.5",
                                  alignClass,
                                  column === "categorie" && "text-muted-foreground"
                                )}
                              >
                                <span className="line-clamp-2 leading-snug" title={value ?? undefined}>
                                  {value ?? "—"}
                                </span>
                              </TableCell>
                            );
                          }
                          if (column === "sri") {
                            return (
                              <TableCell
                                key={column}
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
                          if (column.startsWith("perf_")) {
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
                                        : entry.perf_5ans;
                            return (
                              <TableCell
                                key={column}
                                className={cn(
                                  "px-1 py-1.5 tabular-nums text-[11px] whitespace-nowrap",
                                  alignClass
                                )}
                              >
                                {formatFundPerfPercent(value)}
                              </TableCell>
                            );
                          }
                          return (
                            <TableCell
                              key={column}
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
                        })}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

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
    </div>
  );
}
