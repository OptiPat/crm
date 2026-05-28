import { invoke } from "@tauri-apps/api/core";

export async function beginImportTransaction(): Promise<void> {
  return await invoke<void>("begin_import_transaction");
}

export async function commitImportTransaction(): Promise<void> {
  return await invoke<void>("commit_import_transaction");
}

export async function rollbackImportTransaction(): Promise<void> {
  return await invoke<void>("rollback_import_transaction");
}
