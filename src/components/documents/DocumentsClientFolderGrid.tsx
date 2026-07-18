import { Folder } from "lucide-react";
import type { ClientDocumentFolder } from "@/lib/documents/documents-folder-utils";
import { cn } from "@/lib/utils";

function formatLatestDate(timestamp: number): string {
  if (!timestamp) return "";
  return new Date(timestamp).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function DocumentsClientFolderGrid({
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
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {folders.map((folder) => (
        <button
          key={folder.key}
          type="button"
          className={cn(
            "group flex items-start gap-3 rounded-xl border border-border bg-card p-4 text-left",
            "transition-colors hover:border-primary/40 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          )}
          onClick={() => onOpenFolder(folder.key)}
        >
          <div className="rounded-lg bg-amber-50 p-2.5 text-amber-600 group-hover:bg-amber-100">
            <Folder className="h-6 w-6" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-foreground">{folder.label}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {folder.documentCount} document{folder.documentCount > 1 ? "s" : ""}
              {folder.latestDocumentAt > 0 && (
                <span> — dernier ajout {formatLatestDate(folder.latestDocumentAt)}</span>
              )}
            </p>
          </div>
        </button>
      ))}
    </div>
  );
}
