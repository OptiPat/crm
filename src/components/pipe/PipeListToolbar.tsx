import { Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  coercePipeListStageForPipeType,
  DEFAULT_PIPE_LIST_FILTERS,
  formatPipeListStageFilterLabel,
  hasActivePipeListFilters,
  PIPE_LIST_FILTER_PIPE_TYPES,
  PIPE_LIST_FILTER_STAGES,
  PIPE_LIST_FILTER_SUIVI_STEPS,
  type PipeListFilters,
  type PipeListStageFilter,
} from "@/lib/pipe/pipe-list-filters";
import {
  PIPE_LIST_SORT_KEYS,
  PIPE_LIST_SORT_LABELS,
  type PipeListSortKey,
} from "@/lib/pipe/pipe-list-sort";
import { PIPE_TYPE_LABELS } from "@/lib/pipe/pipe-types";

interface PipeListToolbarProps {
  filters: PipeListFilters;
  resultCount: number;
  totalCount: number;
  onChange: (filters: PipeListFilters) => void;
}

export function PipeListToolbar({
  filters,
  resultCount,
  totalCount,
  onChange,
}: PipeListToolbarProps) {
  const active = hasActivePipeListFilters(filters);
  const stageOptions: PipeListStageFilter[] =
    filters.pipeType === "ACTE_GESTION"
      ? [...PIPE_LIST_FILTER_SUIVI_STEPS]
      : filters.pipeType === "AFFAIRE"
        ? [...PIPE_LIST_FILTER_STAGES]
        : [];

  const clearFilters = () => {
    onChange({
      ...DEFAULT_PIPE_LIST_FILTERS,
      sort: filters.sort,
    });
  };

  return (
    <div className="border-b px-4 py-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">
          {resultCount === totalCount
            ? `${totalCount} pipe${totalCount !== 1 ? "s" : ""}`
            : `${resultCount} / ${totalCount} pipes`}
        </p>
        {active && (
          <Button type="button" variant="ghost" size="sm" className="h-7 gap-1" onClick={clearFilters}>
            <X className="h-3.5 w-3.5" />
            Effacer
          </Button>
        )}
      </div>

      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={filters.search}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
          placeholder="Rechercher titre ou contact…"
          className="h-8 pl-8 text-sm"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Select
          value={filters.pipeType}
          onValueChange={(value) => {
            const pipeType = value as PipeListFilters["pipeType"];
            onChange({
              ...filters,
              pipeType,
              stage: coercePipeListStageForPipeType(pipeType, filters.stage),
            });
          }}
        >
          <SelectTrigger className="h-8 w-[130px] text-xs">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            {PIPE_LIST_FILTER_PIPE_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {type === "ALL" ? "Tous types" : PIPE_TYPE_LABELS[type]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {stageOptions.length > 0 ? (
          <Select
            value={filters.stage}
            onValueChange={(value) =>
              onChange({
                ...filters,
                stage: value as PipeListFilters["stage"],
              })
            }
          >
            <SelectTrigger className="h-8 w-[170px] text-xs">
              <SelectValue
                placeholder={filters.pipeType === "ACTE_GESTION" ? "Avancement" : "Étape"}
              />
            </SelectTrigger>
            <SelectContent>
              {stageOptions.map((stage) => (
                <SelectItem key={stage} value={stage}>
                  {formatPipeListStageFilterLabel(stage)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}

        <Select
          value={filters.sort}
          onValueChange={(value) =>
            onChange({
              ...filters,
              sort: value as PipeListSortKey,
            })
          }
        >
          <SelectTrigger className="h-8 min-w-[170px] text-xs" aria-label="Trier les pipes">
            <SelectValue placeholder="Tri" />
          </SelectTrigger>
          <SelectContent>
            {PIPE_LIST_SORT_KEYS.map((sortKey) => (
              <SelectItem key={sortKey} value={sortKey}>
                {PIPE_LIST_SORT_LABELS[sortKey]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {active && (
        <div className="flex flex-wrap gap-1.5">
          {filters.search.trim() && (
            <Badge variant="secondary" className="font-normal text-xs">
              Recherche : {filters.search.trim()}
            </Badge>
          )}
          {filters.pipeType !== "ALL" && (
            <Badge variant="secondary" className="font-normal text-xs">
              {PIPE_TYPE_LABELS[filters.pipeType]}
            </Badge>
          )}
          {filters.stage !== "ALL" && (
            <Badge variant="secondary" className="font-normal text-xs">
              {formatPipeListStageFilterLabel(filters.stage)}
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}
