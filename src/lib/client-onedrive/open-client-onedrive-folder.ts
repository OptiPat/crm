import { openClientOneDriveFolder } from "@/lib/api/tauri-client-onedrive";
import { invokeErrorMessage } from "@/lib/api/invoke-error";
import { toast } from "sonner";

export async function openClientOneDriveFolderWithFeedback(
  folderId: string,
  options?: { folderName?: string | null }
): Promise<void> {
  try {
    const result = await openClientOneDriveFolder(folderId, options);
    if (result.mode === "web" && result.message) {
      toast.message("Ouverture dans le navigateur", { description: result.message });
    }
  } catch (error) {
    toast.error(invokeErrorMessage(error) || "Impossible d'ouvrir le dossier OneDrive");
    throw error;
  }
}
