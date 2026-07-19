import { cn } from "@/lib/utils";
import type { DocumentsStatFilter } from "@/lib/documents/documents-page-stats";

function StatFilterPill({
  active,
  label,
  count,
  onClick,
  disabled,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const interactive = Boolean(onClick) && !disabled && count > 0;
  return (
    <button
      type="button"
      disabled={!interactive && !active}
      onClick={interactive || active ? onClick : undefined}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "border-primary bg-primary/10 text-primary"
          : interactive
            ? "border-border/80 bg-card text-muted-foreground hover:bg-muted/50"
            : "border-border/60 bg-muted/20 text-muted-foreground/70 cursor-default"
      )}
    >
      {label}
      <span
        className={cn(
          "tabular-nums rounded-full px-1.5 py-0.5 text-[10px]",
          active ? "bg-primary/15" : "bg-muted"
        )}
      >
        {count}
      </span>
    </button>
  );
}

export function DocumentsStatFilterPills({
  total,
  filteredCount,
  patrimoine,
  identite,
  sansClient,
  statFilter,
  hasActiveFilters,
  onSelectAll,
  onToggleStat,
}: {
  total: number;
  filteredCount: number;
  patrimoine: number;
  identite: number;
  sansClient: number;
  statFilter: DocumentsStatFilter | null;
  hasActiveFilters: boolean;
  onSelectAll: () => void;
  onToggleStat: (filter: DocumentsStatFilter) => void;
}) {
  const allActive = statFilter == null && !hasActiveFilters;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <StatFilterPill
        active={allActive}
        label="Tous"
        count={total}
        onClick={hasActiveFilters ? onSelectAll : undefined}
      />
      <StatFilterPill
        active={statFilter === "patrimoine"}
        label="RIO / patrimoine"
        count={patrimoine}
        onClick={() => onToggleStat("patrimoine")}
      />
      <StatFilterPill
        active={statFilter === "identite"}
        label="Identité"
        count={identite}
        onClick={() => onToggleStat("identite")}
      />
      <StatFilterPill
        active={statFilter === "sans_client"}
        label="Sans client"
        count={sansClient}
        onClick={() => onToggleStat("sans_client")}
      />
      {hasActiveFilters && statFilter == null && (
        <span className="text-xs text-muted-foreground tabular-nums">
          {filteredCount} affiché{filteredCount > 1 ? "s" : ""}
        </span>
      )}
    </div>
  );
}
