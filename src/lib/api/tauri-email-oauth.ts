import { invoke } from "@tauri-apps/api/core";

export interface EmailConnectionStatus {
  connected: boolean;
  provider: string | null;
  email: string | null;
  method: "oauth" | "none";
}

export interface OAuthAppSettings {
  google_client_id: string | null;
  google_client_secret_configured: boolean;
  microsoft_client_id: string | null;
}

export interface OAuthAppSettingsInput {
  google_client_id: string | null;
  /** Omit or null = keep existing secret; non-empty string = save new secret */
  google_client_secret?: string | null;
  microsoft_client_id: string | null;
}

export async function getEmailConnectionStatus(): Promise<EmailConnectionStatus> {
  return invoke<EmailConnectionStatus>("get_email_connection_status");
}

export async function getOAuthAppSettings(): Promise<OAuthAppSettings> {
  return invoke<OAuthAppSettings>("get_oauth_app_settings");
}

export async function saveOAuthAppSettings(settings: OAuthAppSettingsInput): Promise<void> {
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

export interface ImportedGmailSignature {
  html: string;
  plain: string;
}

/** Signature Gmail (HTML + texte). Reconnecter Google si accès refusé. */
export async function fetchGmailSignatureForCgp(): Promise<ImportedGmailSignature> {
  return invoke<ImportedGmailSignature>("fetch_gmail_signature_for_cgp");
}
