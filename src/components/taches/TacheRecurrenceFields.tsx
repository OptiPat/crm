import { AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { unixToDateInput, dateInputToUnix } from "@/lib/dates/calendar-date";
import {
  TACHE_MONTH_OPTIONS,
  TACHE_RECURRENCE_FREQ_OPTIONS,
  TACHE_WEEKDAY_OPTIONS,
  defaultRecurrenceFromEcheance,
  detectRecurrenceEcheanceMismatch,
  formatNextOccurrencePreview,
  formatRecurrenceLabel,
  isoWeekdayFromDateInput,
  isActiveRecurrence,
  type TacheRecurrence,
  type TacheRecurrenceFreq,
} from "@/lib/taches/tache-recurrence";

interface TacheRecurrenceFieldsProps {
  enabled: boolean;
  onEnabledChange: (value: boolean) => void;
  recurrence: TacheRecurrence | null;
  onRecurrenceChange: (value: TacheRecurrence | null) => void;
  dateEcheance: string;
  onAlignEcheance?: (alignedDate: string) => void;
}

export function TacheRecurrenceFields({
  enabled,
  onEnabledChange,
  recurrence,
  onRecurrenceChange,
  dateEcheance,
  onAlignEcheance,
}: TacheRecurrenceFieldsProps) {
  const rec = recurrence ?? defaultRecurrenceFromEcheance(dateEcheance);

  const patch = (partial: Partial<TacheRecurrence>) => {
    onRecurrenceChange({ ...rec, ...partial });
  };

  const handleToggle = (checked: boolean) => {
    onEnabledChange(checked);
    if (checked && !isActiveRecurrence(recurrence)) {
      onRecurrenceChange(defaultRecurrenceFromEcheance(dateEcheance));
    }
    if (!checked) {
      onRecurrenceChange(null);
    }
  };

  const preview = enabled ? formatNextOccurrencePreview(dateEcheance, rec) : null;
  const mismatch = enabled
    ? detectRecurrenceEcheanceMismatch(dateEcheance, rec, true)
    : null;

  return (
    <div className="space-y-3 rounded-lg border border-border/80 bg-muted/20 px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Label htmlFor="tache-recurrence" className="text-sm font-medium">
            Tâche récurrente
          </Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            Définissez la règle, puis la première échéance ci-dessous. Les suivantes se
            créent à la validation.
          </p>
        </div>
        <Switch
          id="tache-recurrence"
          checked={enabled}
          onCheckedChange={handleToggle}
        />
      </div>

      {enabled && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Rythme</Label>
              <Select
                value={rec.freq}
                onValueChange={(v) => patch({ freq: v as TacheRecurrenceFreq })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TACHE_RECURRENCE_FREQ_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>
                Tous les{" "}
                {
                  TACHE_RECURRENCE_FREQ_OPTIONS.find((o) => o.value === rec.freq)
                    ?.intervalUnit
                }
              </Label>
              <Input
                type="number"
                min={1}
                max={99}
                value={rec.interval ?? 1}
                onChange={(e) =>
                  patch({
                    interval: Math.max(1, parseInt(e.target.value, 10) || 1),
                  })
                }
              />
            </div>
          </div>

          {rec.freq === "weekly" && (
            <div className="space-y-2">
              <Label>Jours</Label>
              <div className="flex flex-wrap gap-1.5">
                {TACHE_WEEKDAY_OPTIONS.map((day) => {
                  const selected = rec.weekdays?.includes(day.value) ?? false;
                  return (
                    <Button
                      key={day.value}
                      type="button"
                      variant={selected ? "default" : "outline"}
                      size="sm"
                      className="h-7 px-2.5 text-xs"
                      onClick={() => {
                        const current = rec.weekdays ?? [isoWeekdayFromDateInput(dateEcheance)];
                        const next = selected
                          ? current.filter((d) => d !== day.value)
                          : [...current, day.value].sort((a, b) => a - b);
                        patch({ weekdays: next.length ? next : [day.value] });
                      }}
                    >
                      {day.label}
                    </Button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                Ex. lun + ven pour deux rappels par semaine.
              </p>
            </div>
          )}

          {rec.freq === "monthly" && (
            <div className="space-y-2">
              <Label htmlFor="recurrence-dom">Jour du mois (série)</Label>
              <Input
                id="recurrence-dom"
                type="number"
                min={1}
                max={31}
                value={rec.day_of_month ?? 1}
                onChange={(e) =>
                  patch({
                    day_of_month: Math.min(
                      31,
                      Math.max(1, parseInt(e.target.value, 10) || 1)
                    ),
                  })
                }
              />
              <p className="text-xs text-muted-foreground">
                Chaque occurrence tombera sur ce jour (1, 2, 15…). Mois court → dernier
                jour utilisé.
              </p>
            </div>
          )}

          {rec.freq === "yearly" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Mois</Label>
                <Select
                  value={String(rec.month ?? 1)}
                  onValueChange={(v) => patch({ month: parseInt(v, 10) })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TACHE_MONTH_OPTIONS.map((m) => (
                      <SelectItem key={m.value} value={String(m.value)}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Jour</Label>
                <Input
                  type="number"
                  min={1}
                  max={31}
                  value={rec.day_of_month ?? 1}
                  onChange={(e) =>
                    patch({
                      day_of_month: Math.min(
                        31,
                        Math.max(1, parseInt(e.target.value, 10) || 1)
                      ),
                    })
                  }
                />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="recurrence-until">Fin de série (facultatif)</Label>
            <Input
              id="recurrence-until"
              type="date"
              value={rec.until != null ? unixToDateInput(rec.until) : ""}
              onChange={(e) => {
                const until = dateInputToUnix(e.target.value);
                patch({ until: until ?? null });
              }}
            />
          </div>

          {mismatch && onAlignEcheance && (
            <div className="flex flex-col gap-2 rounded-lg border border-amber-200/80 bg-amber-50/70 px-3 py-2 text-xs text-amber-950">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{mismatch.message}</span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 w-fit border-amber-300 bg-white text-xs"
                onClick={() => onAlignEcheance(mismatch.alignedDate)}
              >
                Caler la première échéance sur le {mismatch.alignedLabel}
              </Button>
            </div>
          )}

          <p
            className={cn(
              "text-xs",
              preview?.includes("Fin") ? "text-amber-700" : "text-muted-foreground"
            )}
          >
            {formatRecurrenceLabel(rec)}
            {preview ? ` · ${preview}` : null}
          </p>
        </>
      )}
    </div>
  );
}
