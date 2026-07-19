import { DEFAULT_APP_DISPLAY_NAME, DEFAULT_APP_LOGO_URL } from "@/lib/app-branding";
import { readPublicBrandingLogoDataUrl } from "@/lib/api/tauri-secure-files";

/** URL d'affichage du logo (asset local ou logo embarqué) — sans charger le fichier en mémoire. */
export async function resolveAppLogoSrc(logoPath: string | null | undefined): Promise<string> {
  const path = logoPath?.trim();
  if (!path) {
    return DEFAULT_APP_LOGO_URL;
  }
  try {
    return await readPublicBrandingLogoDataUrl(path);
  } catch (error) {
    console.warn("Logo branding illisible, fallback défaut :", error);
    return DEFAULT_APP_LOGO_URL;
  }
}

export { DEFAULT_APP_DISPLAY_NAME, DEFAULT_APP_LOGO_URL };
