import { convertFileSrc } from "@tauri-apps/api/core";
import { exists, stat } from "@tauri-apps/plugin-fs";
import { DEFAULT_APP_DISPLAY_NAME, DEFAULT_APP_LOGO_URL } from "@/lib/app-branding";

async function logoCacheBust(path: string): Promise<string> {
  try {
    const meta = await stat(path);
    let mtime = Date.now();
    if ("mtime" in meta && meta.mtime != null) {
      const raw = meta.mtime;
      if (raw instanceof Date) {
        mtime = raw.getTime();
      } else if (typeof raw === "number") {
        mtime = raw;
      } else if (typeof raw === "string") {
        mtime = new Date(raw).getTime();
      }
    }
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
