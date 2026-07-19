import type { LinkContactOneDriveFolderResult } from "@/lib/api/tauri-client-onedrive";
import { toast } from "sonner";

export function showOneDriveLinkSharedToast(
  result: LinkContactOneDriveFolderResult
): void {
  if (result.sharedWithLabels.length === 0) return;
  toast.message("Dossier déjà partagé", {
    description: `Également relié à ${result.sharedWithLabels.join(", ")}`,
  });
}
