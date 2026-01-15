import { invoke } from "@tauri-apps/api/core";

export interface SmtpConfig {
  provider: string;
  smtp_server: string;
  smtp_port: number;
  username: string;
  password: string;
  from_name: string;
  from_email: string;
  use_tls: boolean;
}

export interface SmtpConfigInput {
  provider: string;
  smtp_server: string;
  smtp_port: number;
  username: string;
  password: string;
  from_name: string;
  from_email: string;
  use_tls: boolean;
}

export interface SendEmailInput {
  to_email: string;
  to_name?: string;
  subject: string;
  body: string;
}

export async function getSmtpConfig(): Promise<SmtpConfig | null> {
  return invoke<SmtpConfig | null>("get_smtp_config");
}

export async function saveSmtpConfig(config: SmtpConfigInput): Promise<void> {
  return invoke<void>("save_smtp_config", { config });
}

export async function deleteSmtpConfig(): Promise<void> {
  return invoke<void>("delete_smtp_config");
}

export async function testSmtpConnection(): Promise<string> {
  return invoke<string>("test_smtp_connection");
}

export async function sendEmail(emailData: SendEmailInput): Promise<void> {
  return invoke<void>("send_email", { emailData });
}
