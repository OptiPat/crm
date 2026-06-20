import { useEffect, useState } from "react";

export function useDocumentsPageDragDrop(onFilesDropped: (paths: string[]) => void) {
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    let mounted = true;
    let unlisten: (() => void) | undefined;

    void (async () => {
      try {
        const { getCurrentWebview } = await import("@tauri-apps/api/webview");
        const webview = getCurrentWebview();
        unlisten = await webview.onDragDropEvent((event) => {
          if (!mounted) return;
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
    };
  }, [onFilesDropped]);

  return { isDragging };
}
