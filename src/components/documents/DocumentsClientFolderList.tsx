import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ClientDocumentFolder } from "@/lib/documents/documents-folder-utils";
import type { ClientDocumentTypeBadge } from "@/lib/documents/client-document-compliance";
import { cn } from "@/lib/utils";

const TYPE_BADGE_LABEL: Record<ClientDocumentTypeBadge, string> = {
  rio: "RIO",
  qpi: "QPI",
  identite: "CNI",
};

function formatLatestDate(timestamp: number): string {
  if (!timestamp) return "—";
  return new Date(timestamp * 1000).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function DocumentsClientFolderList({
  folders,
  onOpenFolder,
}: {
  folders: ClientDocumentFolder[];
  onOpenFolder: (folderKey: ClientDocumentFolder["key"]) => void;
}) {
  if (folders.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-muted-foreground">
        Aucun dossier pour ces filtres.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="hidden sm:grid sm:grid-cols-[minmax(0,1.4fr)_minmax(0,0.9fr)_minmax(0,1.2fr)_5rem_4.5rem] gap-3 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground bg-muted/40 border-b">
        <span>Client</span>
        <span>Pièces</span>
        <span>À vérifier</span>
        <span className="text-right">Dernier</span>
        <span className="text-right">Nb</span>
      </div>
      <ul className="divide-y divide-border">
        {folders.map((folder) => (
          <li key={folder.key}>
            <button
              type="button"
              className={cn(
                "w-full text-left px-3 py-2.5 transition-colors",
                "hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-inset",
                "grid gap-2 sm:gap-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,0.9fr)_minmax(0,1.2fr)_5rem_4.5rem] sm:items-center"
              )}
              onClick={() => onOpenFolder(folder.key)}
            >
              <p className="font-medium text-sm truncate text-foreground">{folder.label}</p>

              <div className="flex flex-wrap gap-1 min-h-[1.25rem]">
                {folder.typeBadges.length === 0 ? (
                  <span className="text-xs text-muted-foreground">—</span>
                ) : (
                  folder.typeBadges.map((badge) => (
                    <Badge
                      key={badge}
                      variant="secondary"
                      className="text-[10px] px-1.5 py-0 font-medium"
                    >
                      {TYPE_BADGE_LABEL[badge]}
                    </Badge>
                  ))
                )}
              </div>

              <div className="flex flex-wrap gap-1 min-h-[1.25rem]">
                {folder.alerts.length === 0 ? (
                  <span className="text-xs text-muted-foreground">OK</span>
                ) : (
                  folder.alerts.map((alert) => (
                    <span
                      key={alert.id}
                      className={cn(
                        "inline-flex items-center gap-0.5 text-[11px] leading-tight rounded px-1.5 py-0.5",
                        alert.severity === "error"
                          ? "bg-red-50 text-red-800"
                          : "bg-amber-50 text-amber-900"
                      )}
                      title={alert.label}
                    >
                      <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
                      <span className="truncate max-w-[14rem]">{alert.label}</span>
                    </span>
                  ))
                )}
              </div>

              <p className="text-xs text-muted-foreground sm:text-right tabular-nums">
                {formatLatestDate(folder.latestDocumentAt)}
              </p>
              <p className="text-xs text-muted-foreground sm:text-right tabular-nums">
                {folder.documentCount}
              </p>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
