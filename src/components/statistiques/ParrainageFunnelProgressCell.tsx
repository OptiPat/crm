import { computeJdFunnelProgressPercent } from "@/lib/statistiques/organisation-jd-funnel-tracker";
import { cn } from "@/lib/utils";
import { formatCount, progressColorClasses } from "./objectif-table-shared";

/** Progression funnel alimentée par le pipe parrainage (lecture seule). */
export function ParrainageFunnelProgressCell({
  target,
  current,
}: {
  target: number | null;
  current: number;
}) {
  const progressPercent = computeJdFunnelProgressPercent(current, target);
  const isComplete = progressPercent != null && progressPercent >= 100;
  const colors = progressColorClasses(progressPercent);

  return (
    <div
      className={cn(
        "flex flex-col items-end gap-1 rounded-md -mx-1.5 -my-1 px-1.5 py-1",
        isComplete && "bg-emerald-500/10 ring-1 ring-emerald-400/50"
      )}
    >
      <div className="tabular-nums font-medium">{formatCount(target)}</div>
      <div className="h-1.5 w-full max-w-[7.5rem] rounded-full bg-muted overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-500 ease-out", colors.bar)}
          style={{ width: `${Math.min(100, progressPercent ?? 0)}%` }}
        />
      </div>
      <div className={cn("text-[10px] font-medium", colors.text)}>
        {`${isComplete ? "🎉 " : ""}${formatCount(current)} via pipe${progressPercent != null ? ` · ${progressPercent}%` : ""}`}
      </div>
    </div>
  );
}
