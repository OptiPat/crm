import { invoke } from "@tauri-apps/api/core";

export interface EmailConnectionStatus {
  connected: boolean;
  provider: string | null;
  email: string | null;
  method: "oauth" | "none";
  google_calendar_connected: boolean;
  google_calendar_email: string | null;
}

export interface OAuthAppSettings {
  google_client_id: string | null;
  google_client_secret_configured: boolean;
  microsoft_client_id: string | null;
  /** Derniers serveurs de la boîte « autre messagerie » (préremplissage). */
  imap_servers: ImapMailboxServers | null;
}

/** Boîte hors Google / Microsoft 365 (OVH, Ionos…) : SMTP + IMAP. */
export interface ImapMailboxServers {
  imap_host: string;
  imap_port: number;
  smtp_host: string;
  smtp_port: number;
  smtp_security: "starttls" | "tls";
  /** Vide ou null = l'adresse email. */
  username?: string | null;
}

export interface ImapServerSuggestion {
  provider_label: string | null;
  candidates: ImapMailboxServers[];
  hint: string | null;
}

export interface OAuthAppSettingsInput {
  /** Toujours envoyé depuis Emails ; chaîne vide = effacer. */
  google_client_id?: string | null;
  /** Omit or null = keep existing secret; non-empty string = save new secret */
  google_client_secret?: string | null;
  /** Omit to keep existing Microsoft client ID (évite d'effacer OneDrive depuis Emails). */
  microsoft_client_id?: string | null;
}

export async function getEmailConnectionStatus(): Promise<EmailConnectionStatus> {
  return invoke<EmailConnectionStatus>("get_email_connection_status");
}

export async function getOAuthAppSettings(): Promise<OAuthAppSettings> {
  return invoke<OAuthAppSettings>("get_oauth_app_settings");
}

export async function saveMicrosoftOAuthClientId(clientId: string): Promise<void> {
  await invoke("save_microsoft_oauth_client_id", { clientId });
}

export async function saveOAuthAppSettings(settings: OAuthAppSettingsInput): Promise<void> {
  return invoke<void>("save_oauth_app_settings", { settings });
}

export async function connectEmailOAuth(
  provider: "google" | "microsoft",
  options?: { forceConsent?: boolean }
): Promise<EmailConnectionStatus> {
  return invoke<EmailConnectionStatus>("connect_email_oauth", {
    provider,
    forceConsent: options?.forceConsent ?? null,
  });
}

export async function disconnectEmailOAuth(): Promise<void> {
  return invoke<void>("disconnect_email_oauth");
}

export async function connectGoogleCalendarOAuth(
  options?: { forceConsent?: boolean }
): Promise<EmailConnectionStatus> {
  return invoke<EmailConnectionStatus>("connect_google_calendar_oauth", {
    forceConsent: options?.forceConsent ?? null,
  });
}

export async function disconnectGoogleCalendarOAuth(): Promise<void> {
  return invoke<void>("disconnect_google_calendar_oauth_cmd");
}

export async function suggestImapMailboxServers(email: string): Promise<ImapServerSuggestion> {
  return invoke<ImapServerSuggestion>("suggest_imap_mailbox_servers", { email });
}

/** `servers` absent = serveurs détectés depuis l'adresse (essayés dans l'ordre). */
export async function connectImapMailbox(
  email: string,
  password: string,
  servers?: ImapMailboxServers | null
): Promise<EmailConnectionStatus> {
  return invoke<EmailConnectionStatus>("connect_imap_mailbox", {
    email,
    password,
    servers: servers ?? null,
  });
}

/** Quota horaire des envois SMTP (boîte « autre messagerie »). */
export interface SmtpSendQuota {
  /** false pour Google / Microsoft : aucun étalement. */
  applies: boolean;
  hourly_limit: number;
  sent_last_hour: number;
  /** Attente avant le prochain envoi unitaire autorisé (0 = tout de suite). */
  wait_seconds: number;
  /** Attente pour un envoi groupé (pause plus tôt : marge laissée aux envois unitaires). */
  batch_wait_seconds: number;
}

export async function getSmtpSendQuota(): Promise<SmtpSendQuota> {
  return invoke<SmtpSendQuota>("get_smtp_send_quota");
}

export async function setSmtpHourlyLimit(limit: number): Promise<SmtpSendQuota> {
  return invoke<SmtpSendQuota>("set_smtp_hourly_limit", { limit });
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

/** Image ou fichier Outlook `.htm` — sans compte Gmail. */
export async function importEmailSignatureFromFile(
  filePath: string
): Promise<ImportedGmailSignature> {
  return invoke<ImportedGmailSignature>("import_email_signature_from_file_cmd", {
    filePath,
  });
}

export async function getOutlookSignaturesDirectory(): Promise<string | null> {
  return invoke<string | null>("get_outlook_signatures_directory_cmd");
}
