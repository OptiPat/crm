import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import type { PlacementPipeOpenCount } from "@/lib/api/tauri-box-placement";
import { PLACEMENT_UNDECLARED_BOX_LABEL } from "@/lib/placement/placement-operations-ui";
import { cn } from "@/lib/utils";

export function PipePlacementBadge({
  counts,
  className,
}: {
  counts: Pick<PlacementPipeOpenCount, "unsent" | "pending" | "non_conforme"> | undefined;
  className?: string;
}) {
  if (
    !counts ||
    (counts.unsent === 0 && counts.pending === 0 && counts.non_conforme === 0)
  ) {
    return null;
  }

  const badges: ReactNode[] = [];

  if (counts.non_conforme > 0) {
    badges.push(
      <span
        key="nc"
        className={cn(
          "inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
          "bg-red-100 text-red-800 border-red-200",
          className
        )}
        title={`${counts.non_conforme} non conforme(s) partenaire`}
      >
        <AlertTriangle className="h-2.5 w-2.5" />
        {counts.non_conforme}
      </span>
    );
  }

  if (counts.unsent > 0) {
    badges.push(
      <span
        key="unsent"
        className={cn(
          "inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
          "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-900 dark:text-slate-200 dark:border-slate-700",
          className
        )}
        title={
          counts.unsent > 1
            ? `${counts.unsent} actes pas encore déclarés chez Stellium`
            : "Acte pas encore déclaré chez Stellium"
        }
      >
        {PLACEMENT_UNDECLARED_BOX_LABEL}
        {counts.unsent > 1 ? ` · ${counts.unsent}` : ""}
      </span>
    );
  }

  if (counts.pending > 0) {
    badges.push(
      <span
        key="pending"
        className={cn(
          "inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
          "bg-amber-100 text-amber-900 border-amber-200",
          className
        )}
        title={`${counts.pending} en attente partenaire`}
      >
        En attente{counts.pending > 1 ? ` · ${counts.pending}` : ""}
      </span>
    );
  }

  return <span className="inline-flex flex-wrap items-center gap-1">{badges}</span>;
}
