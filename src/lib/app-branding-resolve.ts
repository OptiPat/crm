import { convertFileSrc } from "@tauri-apps/api/core";
import { exists, stat } from "@tauri-apps/plugin-fs";
import { DEFAULT_APP_DISPLAY_NAME, DEFAULT_APP_LOGO_URL } from "@/lib/app-branding";

async function logoCacheBust(path: string): Promise<string> {
  try {
    const meta = await stat(path);
    const mtime =
      "mtime" in meta && meta.mtime != null
        ? new Date(meta.mtime as string | number).getTime()
        : Date.now();
    return `${meta.size}-${mtime}`;
  } catch {
    return String(Date.now());
  }
}

/** URL d'affichage du logo (asset local ou logo embarqué) — sans charger le fichier en mémoire. */
export async function resolveAppLogoSrc(logoPath: string | null | undefined): Promise<string> {
  const path = logoPath?.trim();
  if (!path) {
    return DEFAULT_APP_LOGO_URL;
  }
  try {
    if (!(await exists(path))) {
      return DEFAULT_APP_LOGO_URL;
    }
    const bust = await logoCacheBust(path);
    return `${convertFileSrc(path)}?v=${encodeURIComponent(bust)}`;
  } catch (error) {
    console.warn("Logo branding illisible, fallback défaut :", error);
    return DEFAULT_APP_LOGO_URL;
  }
}

export { DEFAULT_APP_DISPLAY_NAME, DEFAULT_APP_LOGO_URL };
