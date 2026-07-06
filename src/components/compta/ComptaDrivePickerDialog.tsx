import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, FileText, Folder, Loader2, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  browseComptaDrive,
  type ComptaDriveBrowseItem,
} from "@/lib/api/tauri-compta-sync";
import { driveFileViewUrl } from "@/lib/compta/compta-drive";
import { toast } from "sonner";

export interface ComptaDrivePickerContext {
  year: number;
  month: number;
  folderKind: "depenses" | "encaissements";
}

interface ComptaDrivePickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context: ComptaDrivePickerContext;
  onSelect: (url: string, fileName: string) => void;
}

export function ComptaDrivePickerDialog({
  open,
  onOpenChange,
  context,
  onSelect,
}: ComptaDrivePickerDialogProps) {
  const [loading, setLoading] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [parentFolderId, setParentFolderId] = useState<string | null>(null);
  const [items, setItems] = useState<ComptaDriveBrowseItem[]>([]);
  const [search, setSearch] = useState("");

  const loadFolder = useCallback(
    async (targetFolderId: string | null) => {
      setLoading(true);
      try {
        const result = await browseComptaDrive({
          folderId: targetFolderId,
          year: targetFolderId ? undefined : context.year,
          month: targetFolderId ? undefined : context.month,
          monthFolderKind: targetFolderId ? undefined : context.folderKind,
        });
        setFolderName(result.folderName);
        setParentFolderId(result.parentFolderId ?? null);
        setItems(result.items);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Impossible d'ouvrir Drive");
        setItems([]);
      } finally {
        setLoading(false);
      }
    },
    [context.folderKind, context.month, context.year]
  );

  useEffect(() => {
    if (!open) return;
    setSearch("");
    void loadFolder(null);
  }, [open, loadFolder]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => item.name.toLowerCase().includes(q));
  }, [items, search]);

  const handlePickFile = (item: ComptaDriveBrowseItem) => {
    const url = item.webViewLink?.trim() || driveFileViewUrl(item.id);
    onSelect(url, item.name);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] w-[min(96vw,32rem)] flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b px-6 py-4">
          <DialogTitle>Choisir un fichier Drive</DialogTitle>
          <DialogDescription>
            Dossier cible : {context.folderKind === "depenses" ? "Dépenses" : "Encaissements"} du
            mois affiché.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-3 px-6 py-4">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={loading || !parentFolderId}
              title="Dossier parent"
              onClick={() => parentFolderId && void loadFolder(parentFolderId)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <p className="min-w-0 flex-1 truncate text-sm font-medium" title={folderName}>
              {folderName || "…"}
            </p>
          </div>

          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              placeholder="Rechercher…"
              className="pl-9"
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="min-h-[240px] flex-1 overflow-y-auto rounded-lg border">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Chargement…
              </div>
            ) : filteredItems.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">Dossier vide</p>
            ) : (
              <ul className="divide-y">
                {filteredItems.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/60"
                      onClick={() =>
                        item.isFolder
                          ? void loadFolder(item.id)
                          : handlePickFile(item)
                      }
                    >
                      {item.isFolder ? (
                        <Folder className="h-4 w-4 shrink-0 text-amber-600" />
                      ) : (
                        <FileText className="h-4 w-4 shrink-0 text-blue-600" />
                      )}
                      <span className="min-w-0 flex-1 truncate text-sm">{item.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="flex shrink-0 justify-end border-t px-6 py-3">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
