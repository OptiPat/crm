import { useEffect, useState } from "react";
import { claimFileDrop, isFileDropClaimed } from "@/lib/documents/file-drop-claim";

/**
 * Écoute le dépôt de fichiers sur la fenêtre (Tauri).
 * - `claim: false` (page) : ignore le dépôt si une fenêtre d'import l'a réservé.
 * - `claim: true` (fenêtre d'import) : réserve le dépôt tant que `enabled` est vrai.
 */
export function useDocumentsPageDragDrop(
  onFilesDropped: (paths: string[]) => void,
  { enabled = true, claim = false }: { enabled?: boolean; claim?: boolean } = {}
) {
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setIsDragging(false);
      return;
    }
    let mounted = true;
    let unlisten: (() => void) | undefined;
    const release = claim ? claimFileDrop() : undefined;
    const ignored = () => !claim && isFileDropClaimed();

    void (async () => {
      try {
        const { getCurrentWebview } = await import("@tauri-apps/api/webview");
        const webview = getCurrentWebview();
        unlisten = await webview.onDragDropEvent((event) => {
          if (!mounted) return;
          if (ignored()) {
            setIsDragging(false);
            return;
          }
          if (event.payload.type === "over") {
            setIsDragging(true);
          } else if (event.payload.type === "drop") {
            setIsDragging(false);
            if (event.payload.paths.length > 0) {
              onFilesDropped(event.payload.paths);
            }
          } else {
            setIsDragging(false);
          }
        });
      } catch {
        /* navigateur / environnement sans Tauri */
      }
    })();

    return () => {
      mounted = false;
      unlisten?.();
      release?.();
    };
  }, [onFilesDropped, enabled, claim]);

  return { isDragging };
}
