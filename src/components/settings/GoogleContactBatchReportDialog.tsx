import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { GoogleContactBatchSyncResult } from "@/lib/api/tauri-google-contacts";
import { googleContactBatchSyncSummary } from "@/lib/api/tauri-google-contacts";
import {
  filterGoogleBatchEntries,
  GOOGLE_BATCH_REPORT_FILTERS,
  googleContactBatchActionLabel,
  type GoogleBatchReportFilter,
} from "@/lib/contacts/google-contact-batch-report";

type GoogleContactBatchReportDialogProps = {
  result: GoogleContactBatchSyncResult | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function GoogleContactBatchReportDialog({
  result,
  open,
  onOpenChange,
}: GoogleContactBatchReportDialogProps) {
  const [filter, setFilter] = useState<GoogleBatchReportFilter>("all");

  const filtered = useMemo(() => {
    if (!result) return [];
    return filterGoogleBatchEntries(result.entries, filter);
  }, [result, filter]);

  if (!result) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Rapport — Google Contacts</DialogTitle>
          <DialogDescription>{googleContactBatchSyncSummary(result)}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          {GOOGLE_BATCH_REPORT_FILTERS.map((item) => {
            const n = item.count(result);
            if (item.id !== "all" && item.id !== "error" && n === 0) return null;
            if (item.id === "error" && n === 0) return null;
            return (
              <Button
                key={item.id}
                type="button"
                size="sm"
                variant={filter === item.id ? "default" : "outline"}
                onClick={() => setFilter(item.id)}
              >
                {item.label} ({n})
              </Button>
            );
          })}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border/80 divide-y divide-border/60">
          {filtered.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Aucune entrée pour ce filtre.</p>
          ) : (
            filtered.map((entry) => (
              <div
                key={entry.contactId}
                className={`px-3 py-2 text-sm ${
                  entry.action === "error" ? "bg-destructive/5 text-destructive" : ""
                }`}
              >
                <span className="font-medium">
                  {entry.prenom} {entry.nom}
                </span>
                <span className="text-muted-foreground"> · #{entry.contactId}</span>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {googleContactBatchActionLabel(entry.action)}
                  {entry.duplicatesRemoved > 0
                    ? ` · ${entry.duplicatesRemoved} doublon(s) supprimé(s)`
                    : ""}
                  {entry.message ? ` — ${entry.message}` : ""}
                </p>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
