import { invoke } from "@tauri-apps/api/core";

// Types
export interface Setting {
  key: string;
  value: string;
  updated_at: number;
}

export interface CgpConfig {
  nom?: string;
  prenom?: string;
  cabinet?: string;
  email?: string;
  telephone?: string;
  lien_calendly?: string;
  logo_path?: string;
  wizard_completed: boolean;
  wizard_step: number;
}

// ========== SETTINGS GÉNÉRIQUES ==========

export async function getSetting(key: string): Promise<string | null> {
  return await invoke<string | null>("get_setting", { key });
}

export async function setSetting(key: string, value: string): Promise<void> {
  return await invoke<void>("set_setting", { key, value });
}

export async function deleteSetting(key: string): Promise<void> {
  return await invoke<void>("delete_setting", { key });
}

export async function getAllSettings(): Promise<Setting[]> {
  return await invoke<Setting[]>("get_all_settings");
}

// ========== CONFIGURATION CGP ==========

export async function getCgpConfig(): Promise<CgpConfig> {
  return await invoke<CgpConfig>("get_cgp_config");
}

export async function saveCgpConfig(config: CgpConfig): Promise<void> {
  return await invoke<void>("save_cgp_config", { config });
}

// ========== WIZARD ==========

export async function isWizardCompleted(): Promise<boolean> {
  return await invoke<boolean>("is_wizard_completed");
}

export async function completeWizard(): Promise<void> {
  return await invoke<void>("complete_wizard");
}

export async function updateWizardStep(step: number): Promise<void> {
  return await invoke<void>("update_wizard_step", { step });
}
