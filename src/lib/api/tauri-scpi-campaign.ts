import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";

export interface ScpiLastPrepareSnapshot {
  periode: string;
  batchKey: string;
  preparedAt: number;
  bulletinsCount: number;
  contactsMatched: number;
  contactsQueued: number;
  contactsNoEmail: number;
  contactsSkippedAlreadySent: number;
  digestVersion: number;
}

export interface ScpiCampaignDashboard {
  lastPrepare: ScpiLastPrepareSnapshot | null;
  readyCount: number;
  sentSincePrepare: number;
  currentDigestVersion: number;
}

export interface PrepareScpiCampaignResult {
  periode: string;
  batchKey: string;
  bulletinsCount: number;
  contactsMatched: number;
  contactsQueued: number;
  contactsNoEmail: number;
  contactsSkippedAlreadySent: number;
  templateNom: string;
  message: string;
}

export interface ScpiBulletinProgress {
  phase: "ocr" | "summary" | "prepare" | "done" | string;
  current: number;
  total: number;
  fileName?: string | null;
  message: string;
}

export async function getScpiCampaignDashboard(): Promise<ScpiCampaignDashboard> {
  return invoke<ScpiCampaignDashboard>("get_scpi_campaign_dashboard_cmd");
}

export async function pickScpiBulletinPdfPaths(): Promise<string[] | null> {
  const selected = await open({
    multiple: true,
    directory: false,
    filters: [{ name: "Bulletins PDF", extensions: ["pdf"] }],
    title: "Sélectionner les bulletins SCPI (PDF)",
  });
  if (selected == null) return null;
  return Array.isArray(selected) ? selected : [selected];
}

export async function prepareScpiBulletinsFromPdfs(
  pdfPaths: string[]
): Promise<PrepareScpiCampaignResult> {
  return invoke<PrepareScpiCampaignResult>("prepare_scpi_bulletins_from_pdfs_cmd", {
    pdfPaths,
  });
}

export function listenScpiBulletinProgress(
  handler: (progress: ScpiBulletinProgress) => void
): Promise<UnlistenFn> {
  return listen<ScpiBulletinProgress>("scpi-bulletin-progress", (event) => {
    handler(event.payload);
  });
}
