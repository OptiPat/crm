import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  importManagedLogoFile,
  removeManagedLogoFile,
} from "@/lib/api/tauri-secure-files";

export type AppLogoMode = "default" | "custom" | "cabinet";

export interface AppBranding {
  displayName: string;
  logoMode: AppLogoMode;
  /** Chemin absolu sur disque ; null = logo embarqué par défaut. */
  logoPath: string | null;
}

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

  return importManagedLogoFile(selected, "app");
}

export async function removeStoredAppLogo(logoPath: string | undefined | null): Promise<void> {
  if (!logoPath?.trim()) return;
  try {
    await removeManagedLogoFile("app");
  } catch {
    /* fichier déjà absent */
  }
}

export const APP_BRANDING_CHANGED_EVENT = "crm-app-branding-changed";

export function notifyAppBrandingChanged(): void {
  window.dispatchEvent(new CustomEvent(APP_BRANDING_CHANGED_EVENT));
}
