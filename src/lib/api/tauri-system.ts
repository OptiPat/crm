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
