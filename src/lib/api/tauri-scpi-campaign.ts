import { invoke } from "@tauri-apps/api/core";

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

export async function getScpiCampaignDashboard(): Promise<ScpiCampaignDashboard> {
  return invoke<ScpiCampaignDashboard>("get_scpi_campaign_dashboard_cmd");
}

export async function triggerScpiN8nWorkflow(): Promise<string> {
  return invoke<string>("trigger_scpi_n8n_workflow_cmd");
}
