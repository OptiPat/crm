import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  getBackgroundActivityLabel,
  subscribeBackgroundActivity,
  type BackgroundActivityKind,
} from "@/lib/background-activity";

/** Bannière discrète — sync Gmail, Stellium, recalcul étiquettes, envoi newsletter. */
export function BackgroundActivityBanner() {
  const [active, setActive] = useState<BackgroundActivityKind[]>([]);

  useEffect(() => subscribeBackgroundActivity(setActive), []);

  if (active.length === 0) return null;

  const label =
    active.length === 1
      ? getBackgroundActivityLabel(active[0])
      : "Synchronisation en cours…";

  return (
    <div
      className="border-b border-muted bg-muted/40 px-4 py-1.5 flex items-center gap-2 text-xs text-muted-foreground"
      role="status"
      aria-live="polite"
    >
      <Loader2 className="h-3 w-3 animate-spin shrink-0" />
      <span>{label}</span>
    </div>
  );
}
