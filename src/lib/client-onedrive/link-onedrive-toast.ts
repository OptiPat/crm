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

/** Toast optionnel après import document (copie OneDrive activée). */
export function showDocumentOnedriveImportToast(message?: string | null): void {
  if (!message) return;
  if (message.includes("copié")) {
    toast.success(message);
    return;
  }
  if (message.includes("échouée") || message.includes("échoué")) {
    toast.error(message);
    return;
  }
  toast.message(message);
}

/** Toast optionnel après création contact (auto-création dossier OneDrive). */
export function showContactOnedriveAutoCreateToast(message?: string | null): void {
  if (!message) return;
  if (message.includes("échouée") || message.includes("échoué") || message.includes("non créé")) {
    toast.error(message);
    return;
  }
  toast.message(message);
}
