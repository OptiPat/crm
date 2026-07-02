import { CalendarRange } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  formatDashboardPeriodLabel,
  normalizeDateRange,
  type DashboardDateRangeFilter,
} from "@/lib/dashboard/dashboard-period-filter";

interface DashboardPeriodFilterBarProps {
  value: DashboardDateRangeFilter;
  onChange: (next: DashboardDateRangeFilter) => void;
}

export function DashboardPeriodFilterBar({ value, onChange }: DashboardPeriodFilterBarProps) {
  const normalized = normalizeDateRange(value);
  const periodLabel = formatDashboardPeriodLabel(normalized.from, normalized.to);

  const updateField = (field: "from" | "to", raw: string) => {
    onChange(normalizeDateRange({ ...value, [field]: raw }));
  };

  return (
    <div className="rounded-xl border border-border/70 bg-muted/20 px-4 py-3 flex flex-col gap-3">
      <div className="flex flex-col sm:flex-row sm:items-end gap-3 sm:gap-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground shrink-0 sm:pb-2">
          <CalendarRange className="h-4 w-4" aria-hidden />
          <span>Période</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1 min-w-0">
          <div className="space-y-1.5">
            <Label htmlFor="dashboard-period-from">Du</Label>
            <Input
              id="dashboard-period-from"
              type="date"
              value={normalized.from}
              onChange={(e) => updateField("from", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dashboard-period-to">Au</Label>
            <Input
              id="dashboard-period-to"
              type="date"
              value={normalized.to}
              onChange={(e) => updateField("to", e.target.value)}
            />
          </div>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">{periodLabel}</p>
    </div>
  );
}
