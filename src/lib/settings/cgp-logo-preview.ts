import { readLocalImageDataUrl } from "@/lib/api/tauri-secure-files";

/**
 * Charge le logo depuis le disque en data URL (fiable dans le webview Tauri,
 * sans dépendre du protocole asset de convertFileSrc).
 */
export async function loadCgpLogoDataUrl(
  logoPath: string | null | undefined
): Promise<string | null> {
  const path = logoPath?.trim();
  if (!path) return null;

  try {
    return await readLocalImageDataUrl(path);
  } catch (error) {
    console.error("Impossible de charger le logo:", error);
    return null;
  }
}
