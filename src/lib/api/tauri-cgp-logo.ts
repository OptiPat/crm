import { open } from "@tauri-apps/plugin-dialog";
import {
  importManagedLogoFile,
  removeManagedLogoFile,
} from "@/lib/api/tauri-secure-files";

/** Choisit une image et la copie dans AppData/logos/ (chemin persisté dans logo_path). */
export async function pickAndStoreCgpLogo(): Promise<string | null> {
  const selected = await open({
    multiple: false,
    filters: [
      {
        name: "Images",
        extensions: ["png", "jpg", "jpeg", "webp"],
      },
    ],
  });

  if (!selected || typeof selected !== "string") {
    return null;
  }

  return importManagedLogoFile(selected, "cabinet");
}

export async function removeStoredCgpLogo(logoPath: string | undefined | null): Promise<void> {
  if (!logoPath?.trim()) return;
  try {
    await removeManagedLogoFile("cabinet");
  } catch {
    /* fichier déjà absent */
  }
}
