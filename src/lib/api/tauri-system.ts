import { invoke } from "@tauri-apps/api/core";
import {
  getAppRuntimePrefs,
  notifyRuntimePrefsChanged,
} from "@/lib/api/tauri-app-runtime";

export interface AppInfo {
  version: string;
  db_path: string;
  secrets_protection_warning: boolean;
  legacy_secret_key_cleanup_available: boolean;
}

export interface DbBackupEntry {
  name: string;
  size: number;
}

export async function getAppInfo(): Promise<AppInfo> {
  return invoke<AppInfo>("get_app_info");
}

export async function listDbBackups(): Promise<DbBackupEntry[]> {
  const rows = await invoke<[string, number][]>("list_db_backups");
  return rows.map(([name, size]) => ({ name, size }));
}

export async function createManualDbBackup(): Promise<string> {
  return invoke<string>("create_manual_db_backup");
}

export interface CleanupLegacySecretKeyResult {
  backup_path: string;
}

export async function cleanupLegacySecretKey(): Promise<CleanupLegacySecretKeyResult> {
  return invoke<CleanupLegacySecretKeyResult>("cleanup_legacy_secret_key");
}

export async function openDocumentFile(path: string): Promise<void> {
  return invoke<void>("open_document_file", { path });
}

export interface RestoreDbBackupResult {
  restored_from: string;
  safety_backup: string | null;
}

export async function restoreDbBackup(
  backupFilename: string
): Promise<RestoreDbBackupResult> {
  return invoke<RestoreDbBackupResult>("restore_db_backup", { backupFilename });
}

export interface ExportFullArchiveResult {
  zip_path: string;
  zip_size: number;
  files_included: number;
}

export async function exportFullArchive(
  destinationDir: string
): Promise<ExportFullArchiveResult> {
  return invoke<ExportFullArchiveResult>("export_full_archive", {
    destinationDir,
  });
}

export interface ExternalBackupSettings {
  directory: string | null;
  last_backup_path: string | null;
  last_attempt_at: string | null;
  last_error: string | null;
}

export async function getExternalBackupSettings(): Promise<ExternalBackupSettings> {
  return invoke<ExternalBackupSettings>("get_external_backup_settings");
}

export async function setExternalBackupDirectory(
  directory: string | null
): Promise<ExternalBackupSettings> {
  const settings = await invoke<ExternalBackupSettings>("set_external_backup_directory", {
    directory,
  });
  notifyRuntimePrefsChanged(await getAppRuntimePrefs());
  return settings;
}

export async function createExternalBackupNow(): Promise<ExportFullArchiveResult> {
  return invoke<ExportFullArchiveResult>("create_external_backup_now");
}

export async function openExternalUrl(url: string): Promise<void> {
  return invoke<void>("open_external_url", { url });
}
