import { invoke } from "@tauri-apps/api/core";

export interface LocalApiSettings {
  enabled: boolean;
  port: number;
  token: string;
  birthdaysUrl: string;
  scpiCampaignsUrl: string;
  healthUrl: string;
}

export async function getLocalApiSettings(): Promise<LocalApiSettings> {
  return invoke<LocalApiSettings>("get_local_api_settings_cmd");
}

export async function saveLocalApiSettings(
  enabled: boolean,
  port: number
): Promise<LocalApiSettings> {
  return invoke<LocalApiSettings>("save_local_api_settings_cmd", { enabled, port });
}

export async function regenerateLocalApiToken(): Promise<LocalApiSettings> {
  return invoke<LocalApiSettings>("regenerate_local_api_token_cmd");
}
