import { invoke } from "@tauri-apps/api/core";

export interface AppInfo {
  version: string;
  db_path: string;
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

export async function openExternalUrl(url: string): Promise<void> {
  return invoke<void>("open_external_url", { url });
}
