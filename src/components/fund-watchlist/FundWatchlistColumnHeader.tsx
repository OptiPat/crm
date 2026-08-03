import type { CSSProperties } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { TableHead } from "@/components/ui/table";
import {
  type FundWatchlistColumnFilter,
  type FundWatchlistSort,
  type FundWatchlistSortDirection,
  type FundWatchlistTableColumnKey,
  isFundWatchlistAnnualColumnKey,
  columnFilterIsActive,
} from "@/lib/fund-watchlist/fund-watchlist-table";
import { cn } from "@/lib/utils";

interface FundWatchlistColumnHeaderProps {
  column: FundWatchlistTableColumnKey;
  label: string;
  align?: "left" | "right" | "center";
  className?: string;
  style?: CSSProperties;
  sort: FundWatchlistSort;
  filter: FundWatchlistColumnFilter | undefined;
  distinctValues?: string[];
  onCycleSort: (column: FundWatchlistTableColumnKey) => void;
  onSetSort: (column: FundWatchlistTableColumnKey, direction: FundWatchlistSortDirection) => void;
  onFilterChange: (
    column: FundWatchlistTableColumnKey,
    filter: FundWatchlistColumnFilter | undefined
  ) => void;
}

function isNumericColumn(column: FundWatchlistTableColumnKey): boolean {
  if (isFundWatchlistAnnualColumnKey(column)) return true;
  return (
    column === "sri" ||
    column === "favorite" ||
    column === "score_ct" ||
    column === "sharpe_ratio" ||
    column.startsWith("perf_") ||
    column.startsWith("vol_")
  );
}

function isCategoricalColumn(column: FundWatchlistTableColumnKey): boolean {
  if (isFundWatchlistAnnualColumnKey(column)) return false;
  return (
    column === "favorite" ||
    column === "sri" ||
    column === "sfdr" ||
    column === "categorie"
  );
}

function FilterPopoverContent({
  column,
  label,
  align,
  activeSort,
  filter,
  distinctValues,
  selectedValues,
  activeFilter,
  onSetSort,
  onFilterChange,
  setFilter,
  toggleCategoricalValue,
}: {
  column: FundWatchlistTableColumnKey;
  label: string;
  align: "left" | "right" | "center";
  activeSort: "asc" | "desc" | null;
  filter: FundWatchlistColumnFilter | undefined;
  distinctValues: string[];
  selectedValues: string[];
  activeFilter: boolean;
  onSetSort: (column: FundWatchlistTableColumnKey, direction: FundWatchlistSortDirection) => void;
  onFilterChange: (
    column: FundWatchlistTableColumnKey,
    filter: FundWatchlistColumnFilter | undefined
  ) => void;
  setFilter: (next: FundWatchlistColumnFilter) => void;
  toggleCategoricalValue: (value: string, checked: boolean) => void;
}) {
  return (
    <PopoverContent align={align === "right" ? "end" : "start"} className="w-64 space-y-3 p-3">
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Tri — {label}</p>
        <div className="flex gap-1">
          <Button
            type="button"
            size="sm"
            variant={activeSort === "asc" ? "secondary" : "outline"}
            className="flex-1"
            onClick={() => onSetSort(column, "asc")}
          >
            <ArrowUp className="h-3.5 w-3.5 mr-1" />
            Croissant
          </Button>
          <Button
            type="button"
            size="sm"
            variant={activeSort === "desc" ? "secondary" : "outline"}
            className="flex-1"
            onClick={() => onSetSort(column, "desc")}
          >
            <ArrowDown className="h-3.5 w-3.5 mr-1" />
            Décroissant
          </Button>
        </div>
      </div>

      {!isNumericColumn(column) && !isCategoricalColumn(column) && (
        <div className="space-y-1.5">
          <Label htmlFor={`filter-${column}-text`} className="text-xs">
            Contient
          </Label>
          <Input
            id={`filter-${column}-text`}
            value={filter?.text ?? ""}
            onChange={(e) => setFilter({ ...filter, text: e.target.value })}
            placeholder="Texte…"
          />
        </div>
      )}

      {isNumericColumn(column) && !isCategoricalColumn(column) && (
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label htmlFor={`filter-${column}-min`} className="text-xs">
              Min %
            </Label>
            <Input
              id={`filter-${column}-min`}
              value={filter?.min ?? ""}
              onChange={(e) => setFilter({ ...filter, min: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`filter-${column}-max`} className="text-xs">
              Max %
            </Label>
            <Input
              id={`filter-${column}-max`}
              value={filter?.max ?? ""}
              onChange={(e) => setFilter({ ...filter, max: e.target.value })}
            />
          </div>
        </div>
      )}

      {isCategoricalColumn(column) && distinctValues.length > 0 && (
        <div className="space-y-2 max-h-48 overflow-y-auto">
          <p className="text-xs font-medium text-muted-foreground">Valeurs</p>
          {distinctValues.map((value) => (
            <label
              key={value}
              className="flex items-center gap-2 text-sm cursor-pointer"
            >
              <Checkbox
                checked={selectedValues.includes(value)}
                onCheckedChange={(next) =>
                  toggleCategoricalValue(value, next === true)
                }
              />
              <span className="truncate">{value}</span>
            </label>
          ))}
        </div>
      )}

      {activeFilter && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => onFilterChange(column, undefined)}
        >
          Effacer le filtre
        </Button>
      )}
    </PopoverContent>
  );
}

export function FundWatchlistColumnHeader({
  column,
  label,
  align = "left",
  className,
  style,
  sort,
  filter,
  distinctValues = [],
  onCycleSort,
  onSetSort,
  onFilterChange,
}: FundWatchlistColumnHeaderProps) {
  const activeSort = sort?.column === column ? sort.direction : null;
  const activeFilter = columnFilterIsActive(filter);
  const selectedValues = filter?.values ?? distinctValues;

  const setFilter = (next: FundWatchlistColumnFilter) => {
    if (!columnFilterIsActive(next)) {
      onFilterChange(column, undefined);
      return;
    }
    onFilterChange(column, next);
  };

  const toggleCategoricalValue = (value: string, checked: boolean) => {
    const base = filter?.values ?? distinctValues;
    const updated = checked
      ? [...new Set([...base, value])]
      : base.filter((item) => item !== value);
    if (updated.length === 0) {
      setFilter({ values: ["__none__"] });
      return;
    }
    if (updated.length === distinctValues.length) {
      onFilterChange(column, filter?.text ? { text: filter.text } : undefined);
      return;
    }
    setFilter({ ...filter, values: updated });
  };

  const popoverProps = {
    column,
    label,
    align,
    activeSort,
    filter,
    distinctValues,
    selectedValues,
    activeFilter,
    onSetSort,
    onFilterChange,
    setFilter,
    toggleCategoricalValue,
  };

  const isCompact = column === "favorite";

  return (
    <TableHead
      style={style}
      className={cn("h-auto overflow-hidden p-0 align-bottom bg-card", className)}
    >
      <div
        className={cn(
          "flex min-h-[3rem] flex-col gap-1 py-1.5",
          isCompact ? "items-center px-0" : "px-1",
          align === "right" && "items-end",
          align === "center" && "items-center",
          align === "left" && "items-start"
        )}
        title={isCompact ? label : undefined}
      >
        {!isCompact && (
          <span
            className={cn(
              "w-full text-xs font-semibold leading-snug text-foreground",
              align === "right"
                ? "text-right"
                : align === "center"
                  ? "text-center whitespace-normal"
                  : "text-left"
            )}
            title={label}
          >
            {label}
          </span>
        )}

        <div
          className={cn(
            "flex w-full items-center gap-0.5",
            align === "right" && "justify-end",
            align === "center" && "justify-center",
            align === "left" && "justify-start"
          )}
        >
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            aria-label={`Trier ${label}`}
            onClick={() => onCycleSort(column)}
          >
            {activeSort === "asc" ? (
              <ArrowUp className="h-3.5 w-3.5" />
            ) : activeSort === "desc" ? (
              <ArrowDown className="h-3.5 w-3.5" />
            ) : (
              <ArrowUpDown className="h-3.5 w-3.5 opacity-50" />
            )}
          </Button>

          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={cn(
                  "h-6 w-6 text-muted-foreground hover:text-foreground",
                  activeFilter && "text-primary"
                )}
                aria-label={`Filtrer ${label}`}
              >
                <Filter className="h-3.5 w-3.5" />
              </Button>
            </PopoverTrigger>
            <FilterPopoverContent {...popoverProps} />
          </Popover>
        </div>
      </div>
    </TableHead>
  );
}
