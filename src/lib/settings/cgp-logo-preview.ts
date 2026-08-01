import { getAppBranding } from "@/lib/api/tauri-app-branding";
import {
  readLocalImageDataUrl,
  readPublicBrandingLogoDataUrl,
} from "@/lib/api/tauri-secure-files";

async function readLogoDataUrlFromPath(path: string): Promise<string | null> {
  const trimmed = path.trim();
  if (!trimmed) return null;

  try {
    return await readPublicBrandingLogoDataUrl(trimmed);
  } catch {
    try {
      return await readLocalImageDataUrl(trimmed);
    } catch (error) {
      console.error("Impossible de charger le logo:", error);
      return null;
    }
  }
}

/**
 * Charge le logo cabinet en data URL (emails, aperçu newsletter, profil).
 * Les logos gérés (AppData/logos/cabinet-logo.*) passent par la commande dédiée,
 * sans dépendre du périmètre fs du dialogue fichier.
 */
export async function loadCgpLogoDataUrl(
  logoPath: string | null | undefined
): Promise<string | null> {
  const explicit = logoPath?.trim();
  if (explicit) {
    const url = await readLogoDataUrlFromPath(explicit);
    if (url) return url;
  }

  try {
    const branding = await getAppBranding();
    if (branding.logoMode === "cabinet" && branding.logoPath?.trim()) {
      return await readLogoDataUrlFromPath(branding.logoPath);
    }
  } catch (error) {
    console.error("Impossible de résoudre le logo cabinet:", error);
  }

  return null;
}
