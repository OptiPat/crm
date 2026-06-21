import { invoke } from "@tauri-apps/api/core";

export interface PrepareStelliumPerfCampaignInput {
  periode: string;
  releveDateUnix: number;
  investissementIds: number[];
}

export interface DiscoverStelliumPerfCampaignPrepareResponse {
  periode: string;
  releveDateUnix: number;
  investissementIds: number[];
  contractCount: number;
}

export interface PrepareStelliumPerfCampaignResult {
  periode: string;
  batchKey: string;
  contactsMatched: number;
  contactsQueued: number;
  contactsNoEmail: number;
  contactsProxyToParent: number;
  contactsSkippedAlreadySent: number;
  message: string;
}

export async function ensureStelliumPerfEmailTemplates(): Promise<void> {
  await invoke("ensure_stellium_perf_email_templates");
}

export async function discoverStelliumPerfCampaignPrepareInput(): Promise<DiscoverStelliumPerfCampaignPrepareResponse | null> {
  return invoke("discover_stellium_perf_campaign_prepare_input");
}

export async function prepareStelliumPerfCampaign(
  input: PrepareStelliumPerfCampaignInput
): Promise<PrepareStelliumPerfCampaignResult> {
  return invoke("prepare_stellium_perf_campaign", {
    input: {
      periode: input.periode,
      releve_date_unix: input.releveDateUnix,
      investissement_ids: input.investissementIds,
    },
  });
}
