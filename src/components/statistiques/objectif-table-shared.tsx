import { RotateCcw } from "lucide-react";
import { formatFilleulVolumeDisplayWhole } from "@/lib/organisation/organisation-branch-volumes";
import { cn } from "@/lib/utils";

/** Formatage et champ hypothèse éditable partagés entre les sections du « Tableau d'objectifs ». */

export function formatCount(value: number | null): string {
  return value != null ? value.toLocaleString("fr-FR") : "—";
}

export function formatVolume(value: number | null): string {
  return value != null ? formatFilleulVolumeDisplayWhole(value) : "—";
}

export function formatRatio(value: number | null): string {
  return value != null ? value.toLocaleString("fr-FR", { maximumFractionDigits: 1 }) : "—";
}

export function formatCountDelta(current: number | null, target: number | null): string | null {
  if (current == null || target == null) return null;
  const delta = target - current;
  if (delta === 0) return null;
  return `${delta > 0 ? "+" : "−"}${Math.abs(delta).toLocaleString("fr-FR")}`;
}

export function formatVolumeDelta(current: number | null, target: number | null): string | null {
  if (current == null || target == null) return null;
  const delta = target - current;
  if (Math.abs(delta) < 1) return null;
  return `${delta > 0 ? "+" : "−"}${formatVolume(Math.abs(delta))}`;
}

/** Petit badge d'écart vs la colonne « Actuel » (vert si progression, rouge si recul). */
export function DeltaBadge({ value }: { value: string | null }) {
  if (value == null) return null;
  const isNegative = value.startsWith("−");
  return (
    <span className={cn("ml-1.5 text-[11px] font-normal", isNegative ? "text-red-500" : "text-emerald-600")}>
      {value}
    </span>
  );
}

/** Couleurs de progression partagées (compteurs JD + jauges de volume) : neutre → ambre → émeraude. */
export function progressColorClasses(percent: number | null): { bar: string; text: string } {
  if (percent == null || percent <= 0) return { bar: "bg-muted-foreground/30", text: "text-muted-foreground/70" };
  if (percent >= 100) return { bar: "bg-emerald-500", text: "text-emerald-600" };
  if (percent >= 60) return { bar: "bg-emerald-400", text: "text-emerald-600" };
  if (percent >= 30) return { bar: "bg-amber-400", text: "text-amber-600" };
  return { bar: "bg-primary/70", text: "text-muted-foreground" };
}

/** Jauge de progression en lecture seule (pas de +/- : la valeur « Actuel » vient déjà des vraies données). */
export function VolumeProgressGauge({ current, target }: { current: number | null; target: number | null }) {
  const percent = current != null && target != null && target > 0 ? (current / target) * 100 : null;
  const isComplete = percent != null && percent >= 100;
  const colors = progressColorClasses(percent);
  return (
    <div className="flex items-center gap-1.5 w-full max-w-[7.5rem] ml-auto">
      <div className="h-1 flex-1 rounded-full bg-muted overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-700 ease-out", colors.bar)}
          style={{ width: `${Math.min(100, percent ?? 0)}%` }}
        />
      </div>
      <span className={cn("text-[10px] font-medium tabular-nums shrink-0 w-7 text-right", colors.text)}>
        {isComplete ? "🎉" : percent != null ? `${Math.round(percent)}%` : "—"}
      </span>
    </div>
  );
}

/** Champ hypothèse éditable (%, ou €) avec bouton de réinitialisation vers la valeur observée. */
export function AssumptionField({
  id,
  label,
  suffix,
  value,
  defaultValue,
  step,
  width,
  onChange,
  groupValue,
  groupLabel,
  observedValue,
  observedExerciceLabel,
  mode = "number",
}: {
  id: string;
  label: string;
  suffix: string;
  value: number;
  defaultValue: number;
  step?: number;
  width: string;
  onChange: (value: number) => void;
  /** Référence groupe (nationale) affichée en tooltip au survol — null si non disponible pour cet indicateur. */
  groupValue?: number | null;
  /** Libellé utilisé dans le tooltip, ex. « Réf. groupe ». */
  groupLabel?: string;
  /** Valeur observée (exercice n-1) affichée sous le champ — distincte de defaultValue si besoin. */
  observedValue?: number | null;
  /** Libellé de l'exercice source de la valeur observée (ex. « 2025-2026 »). */
  observedExerciceLabel?: string | null;
  /** "money" affiche un champ texte avec séparateurs de milliers, sans flèches numériques, plus lisible pour des € (ex. 164 024 plutôt que 164024). */
  mode?: "number" | "money";
}) {
  const groupTitle =
    groupValue != null
      ? `${groupLabel ?? "Réf. groupe"} : ${groupValue.toLocaleString("fr-FR")} ${suffix}`
      : undefined;
  const hasObservedValue = observedValue != null;
  const referenceValue = hasObservedValue ? observedValue : defaultValue;
  const isModified = value !== referenceValue;
  return (
    <div
      className="flex flex-col gap-1 rounded-lg border border-border/50 bg-muted/20 px-2.5 py-2"
      title={groupTitle}
    >
      <label htmlFor={id} className="text-[11px] font-medium text-muted-foreground leading-tight">
        {label}
      </label>
      <div className="flex items-center gap-1">
        {mode === "money" ? (
          <input
            id={id}
            type="text"
            inputMode="numeric"
            value={value.toLocaleString("fr-FR")}
            onChange={(e) => {
              const digits = e.target.value.replace(/[^\d-]/g, "");
              onChange(digits === "" || digits === "-" ? 0 : Number(digits));
            }}
            className={cn(
              "rounded-md border border-border/70 bg-background px-2 py-1 text-right text-sm tabular-nums",
              width
            )}
          />
        ) : (
          <input
            id={id}
            type="number"
            step={step}
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            className={cn(
              "rounded-md border border-border/70 bg-background px-2 py-1 text-right text-sm tabular-nums",
              width
            )}
          />
        )}
        <span className="text-muted-foreground text-xs">{suffix}</span>
        {isModified && (
          <button
            type="button"
            onClick={() => onChange(referenceValue)}
            title={`Réinitialiser à la valeur observée (${referenceValue.toLocaleString("fr-FR")} ${suffix})`}
            className="ml-auto text-muted-foreground hover:text-foreground shrink-0"
          >
            <RotateCcw className="size-3.5" />
          </button>
        )}
      </div>
      <div className="h-3.5 text-[10px] text-muted-foreground/70 leading-tight">
        {isModified
          ? hasObservedValue
            ? `obs.${observedExerciceLabel != null ? ` (${observedExerciceLabel})` : ""} ${referenceValue.toLocaleString("fr-FR")} ${suffix}`
            : `obs. ${referenceValue.toLocaleString("fr-FR")} ${suffix}`
          : "\u00A0"}
      </div>
    </div>
  );
}
