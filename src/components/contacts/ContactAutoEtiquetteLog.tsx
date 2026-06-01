import { useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  getContactAutoEtiquetteLog,
  type AutoEtiquetteLogEntry,
} from "@/lib/api/tauri-segments";
import { cn } from "@/lib/utils";

function groupByEvaluatedAt(entries: AutoEtiquetteLogEntry[]) {
  const groups = new Map<number, AutoEtiquetteLogEntry[]>();
  for (const entry of entries) {
    const batch = groups.get(entry.evaluatedAt) ?? [];
    batch.push(entry);
    groups.set(entry.evaluatedAt, batch);
  }
  return Array.from(groups.entries())
    .sort(([a], [b]) => b - a)
    .map(([evaluatedAt, items]) => ({ evaluatedAt, items }));
}

function formatEvaluatedAt(ts: number): string {
  return new Date(ts * 1000).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ContactAutoEtiquetteLog({ contactId }: { contactId: number }) {
  const [entries, setEntries] = useState<AutoEtiquetteLogEntry[]>([]);

  useEffect(() => {
    getContactAutoEtiquetteLog(contactId, 15)
      .then(setEntries)
      .catch(() => setEntries([]));
  }, [contactId]);

  const groups = useMemo(() => groupByEvaluatedAt(entries), [entries]);
  const latest = groups[0];

  if (entries.length === 0) return null;

  const appliedLabels =
    latest?.items.filter((e) => e.matched).map((e) => e.etiquetteNom) ?? [];

  return (
    <details className="group w-full mt-2 rounded-lg border bg-muted/20 text-xs">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 [&::-webkit-details-marker]:hidden">
        <span className="font-medium text-muted-foreground shrink-0">
          Dernières évaluations automatiques
        </span>
        <span className="min-w-0 truncate text-muted-foreground">
          {groups.length > 1
            ? `${groups.length} passages`
            : latest
              ? formatEvaluatedAt(latest.evaluatedAt)
              : null}
          {appliedLabels.length > 0 && (
            <span className="text-green-700">
              {" · "}
              {appliedLabels.join(", ")}
            </span>
          )}
        </span>
        <ChevronDown className="h-3.5 w-3.5 ml-auto shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t px-3 py-2 space-y-3">
        {groups.map(({ evaluatedAt, items }) => (
          <div key={evaluatedAt}>
            {groups.length > 1 && (
              <p className="text-[11px] font-medium text-muted-foreground mb-1">
                {formatEvaluatedAt(evaluatedAt)}
              </p>
            )}
            <ul className="space-y-1">
              {items.map((e, i) => (
                <li
                  key={`${e.etiquetteId}-${e.evaluatedAt}-${i}`}
                  className="flex flex-wrap gap-x-2"
                >
                  <span className="font-medium">{e.etiquetteNom}</span>
                  <span
                    className={cn(
                      e.matched ? "text-green-700" : "text-muted-foreground"
                    )}
                  >
                    {e.matched ? "appliquée" : "non applicable"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </details>
  );
}
