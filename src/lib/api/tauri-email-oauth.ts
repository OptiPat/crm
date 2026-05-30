import { invoke } from "@tauri-apps/api/core";

export interface EmailConnectionStatus {
  connected: boolean;
  provider: string | null;
  email: string | null;
  method: "oauth" | "smtp" | "none";
}

export interface OAuthAppSettings {
  google_client_id: string | null;
  microsoft_client_id: string | null;
}

export async function getEmailConnectionStatus(): Promise<EmailConnectionStatus> {
  return invoke<EmailConnectionStatus>("get_email_connection_status");
}

export async function getOAuthAppSettings(): Promise<OAuthAppSettings> {
  return invoke<OAuthAppSettings>("get_oauth_app_settings");
}

export async function saveOAuthAppSettings(settings: OAuthAppSettings): Promise<void> {
  return invoke<void>("save_oauth_app_settings", { settings });
}

export async function connectEmailOAuth(
  provider: "google" | "microsoft"
): Promise<EmailConnectionStatus> {
  return invoke<EmailConnectionStatus>("connect_email_oauth", { provider });
}

export async function disconnectEmailOAuth(): Promise<void> {
  return invoke<void>("disconnect_email_oauth");
}

export async function testEmailConnection(): Promise<string> {
  return invoke<string>("test_email_connection");
}
