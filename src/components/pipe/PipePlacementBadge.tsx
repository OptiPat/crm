import { AlertTriangle, Clock } from "lucide-react";
import type { PlacementPipeOpenCount } from "@/lib/api/tauri-box-placement";
import { cn } from "@/lib/utils";

export function PipePlacementBadge({
  counts,
  className,
}: {
  counts: Pick<PlacementPipeOpenCount, "pending" | "non_conforme"> | undefined;
  className?: string;
}) {
  if (!counts || (counts.pending === 0 && counts.non_conforme === 0)) {
    return null;
  }

  const isUrgent = counts.non_conforme > 0;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
        isUrgent
          ? "bg-red-100 text-red-800 border-red-200"
          : "bg-amber-100 text-amber-900 border-amber-200",
        className
      )}
      title={
        isUrgent
          ? `${counts.non_conforme} non conforme(s) partenaire`
          : `${counts.pending} en attente partenaire`
      }
    >
      {isUrgent ? (
        <AlertTriangle className="h-2.5 w-2.5" />
      ) : (
        <Clock className="h-2.5 w-2.5" />
      )}
      {isUrgent ? counts.non_conforme : counts.pending}
    </span>
  );
}
