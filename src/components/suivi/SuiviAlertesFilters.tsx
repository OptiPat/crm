import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  ALERTE_CATEGORY_OPTIONS,
  type AlerteCategoryFilter,
} from "@/lib/alertes/alerte-category";

export function SuiviAlertesFilters({
  value,
  counts,
  onChange,
}: {
  value: AlerteCategoryFilter;
  counts: Record<AlerteCategoryFilter, number>;
  onChange: (filter: AlerteCategoryFilter) => void;
}) {
  return (
    <div
      className="flex flex-wrap gap-2 pb-4 border-b border-border/60"
      role="tablist"
      aria-label="Filtrer les alertes"
    >
      {ALERTE_CATEGORY_OPTIONS.map((opt) => {
        const n = counts[opt.id];
        const selected = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(opt.id)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
              selected
                ? "border-primary bg-primary text-primary-foreground shadow-sm"
                : "border-border bg-background hover:bg-muted/60",
              n === 0 && opt.id !== "all" && "opacity-50"
            )}
          >
            {opt.label}
            <Badge
              variant={selected ? "secondary" : "outline"}
              className={cn(
                "h-5 min-w-[1.25rem] px-1.5 text-[10px] tabular-nums",
                selected && "bg-primary-foreground/20 text-primary-foreground border-0"
              )}
            >
              {n}
            </Badge>
          </button>
        );
      })}
    </div>
  );
}
