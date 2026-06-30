import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { copyFile, exists, mkdir, remove } from "@tauri-apps/plugin-fs";
import { appDataDir, join } from "@tauri-apps/api/path";

export type AppLogoMode = "default" | "custom" | "cabinet";

export interface AppBranding {
  displayName: string;
  logoMode: AppLogoMode;
  /** Chemin absolu sur disque ; null = logo embarqué par défaut. */
  logoPath: string | null;
}

const APP_LOGO_BASENAME = "app-branding";

export async function getAppBranding(): Promise<AppBranding> {
  return await invoke<AppBranding>("get_app_branding");
}

export async function saveAppBranding(input: {
  displayName: string;
  logoMode: AppLogoMode;
  logoPath?: string | null;
}): Promise<AppBranding> {
  return await invoke<AppBranding>("save_app_branding", {
    displayName: input.displayName,
    logoMode: input.logoMode,
    logoPath: input.logoPath ?? null,
  });
}

export interface OsBrandingResult {
  windowIconApplied: boolean;
  shortcutsUpdated: number;
  skippedUnchanged?: boolean;
}

/** Icône barre des tâches + raccourcis bureau (Windows). Idempotent — rappeler après chaque MAJ. */
export async function applyAppBrandingOs(): Promise<OsBrandingResult> {
  return await invoke<OsBrandingResult>("apply_app_branding_os");
}

/** Choisit une image et la copie dans AppData/logos/app-branding.* */
export async function pickAndStoreAppLogo(): Promise<string | null> {
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

  const appData = await appDataDir();
  const logosDir = await join(appData, "logos");
  if (!(await exists(logosDir))) {
    await mkdir(logosDir, { recursive: true });
  }

  const extMatch = selected.match(/\.(png|jpe?g|webp)$/i);
  const ext = extMatch ? extMatch[1].toLowerCase().replace("jpeg", "jpg") : "png";
  const destinationPath = await join(logosDir, `${APP_LOGO_BASENAME}.${ext}`);

  for (const oldExt of ["png", "jpg", "webp"]) {
    const oldPath = await join(logosDir, `${APP_LOGO_BASENAME}.${oldExt}`);
    if (await exists(oldPath)) {
      await remove(oldPath);
    }
  }

  await copyFile(selected, destinationPath);
  return destinationPath;
}

export async function removeStoredAppLogo(logoPath: string | undefined | null): Promise<void> {
  if (!logoPath?.trim()) return;
  try {
    if (await exists(logoPath)) {
      await remove(logoPath);
    }
  } catch {
    /* fichier déjà absent */
  }
}

export const APP_BRANDING_CHANGED_EVENT = "crm-app-branding-changed";

export function notifyAppBrandingChanged(): void {
  window.dispatchEvent(new CustomEvent(APP_BRANDING_CHANGED_EVENT));
}
