import { useCallback, useEffect, useState } from "react";
import { CalendarRange } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  DASHBOARD_PERIOD_PRESETS,
  formatDashboardPeriodLabel,
  getDashboardPeriodPreset,
  isoDateToFrenchInput,
  normalizeDateRange,
  parseFrenchDateInputToIso,
  type DashboardDateRangeFilter,
  type DashboardPeriodPresetId,
} from "@/lib/dashboard/dashboard-period-filter";

interface DashboardPeriodFilterBarProps {
  value: DashboardDateRangeFilter;
  onChange: (next: DashboardDateRangeFilter) => void;
  /** Texte d'aide sous la plage (défaut : regroupement graphique activité). */
  hint?: string;
}

function matchesPreset(
  value: DashboardDateRangeFilter,
  presetId: DashboardPeriodPresetId
): boolean {
  const preset = normalizeDateRange(getDashboardPeriodPreset(presetId));
  const current = normalizeDateRange(value);
  return preset.from === current.from && preset.to === current.to;
}

export function DashboardPeriodFilterBar({
  value,
  onChange,
  hint = "Plage libre (aucune limite) — le graphique d'activité regroupe par jour, mois ou année selon la durée.",
}: DashboardPeriodFilterBarProps) {
  const normalized = normalizeDateRange(value);
  const periodLabel = formatDashboardPeriodLabel(normalized.from, normalized.to);

  const [draftFrom, setDraftFrom] = useState(() => isoDateToFrenchInput(normalized.from));
  const [draftTo, setDraftTo] = useState(() => isoDateToFrenchInput(normalized.to));
  const [fieldError, setFieldError] = useState<string | null>(null);

  useEffect(() => {
    setDraftFrom(isoDateToFrenchInput(normalized.from));
    setDraftTo(isoDateToFrenchInput(normalized.to));
    setFieldError(null);
  }, [normalized.from, normalized.to]);

  const commitDraft = useCallback((): boolean => {
    const fromIso = parseFrenchDateInputToIso(draftFrom);
    const toIso = parseFrenchDateInputToIso(draftTo);
    if (!fromIso || !toIso) {
      setFieldError("Dates invalides — utilisez jj/mm/aaaa (ex. 01/08/2026).");
      return false;
    }
    setFieldError(null);
    onChange(normalizeDateRange({ from: fromIso, to: toIso }));
    return true;
  }, [draftFrom, draftTo, onChange]);

  const applyPreset = (presetId: DashboardPeriodPresetId) => {
    const next = normalizeDateRange(getDashboardPeriodPreset(presetId));
    setFieldError(null);
    onChange(next);
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
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="jj/mm/aaaa"
              value={draftFrom}
              onChange={(e) => {
                setDraftFrom(e.target.value);
                setFieldError(null);
              }}
              onBlur={() => void commitDraft()}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitDraft();
                }
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dashboard-period-to">Au</Label>
            <Input
              id="dashboard-period-to"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="jj/mm/aaaa"
              value={draftTo}
              onChange={(e) => {
                setDraftTo(e.target.value);
                setFieldError(null);
              }}
              onBlur={() => void commitDraft()}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitDraft();
                }
              }}
            />
          </div>
        </div>
        <Button type="button" variant="secondary" size="sm" className="shrink-0" onClick={commitDraft}>
          Appliquer
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {DASHBOARD_PERIOD_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => applyPreset(preset.id)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              matchesPreset(value, preset.id)
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:border-primary/40 hover:bg-muted/50"
            )}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <p className="text-sm text-muted-foreground">{periodLabel}</p>
      {fieldError ? (
        <p className="text-xs text-destructive" role="alert">
          {fieldError}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}
