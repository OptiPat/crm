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

export interface StelliumPerfLastPrepareSnapshot {
  periode: string;
  batchKey: string;
  preparedAt: number;
  contractCount: number;
  contactsMatched: number;
  contactsQueued: number;
  contactsNoEmail: number;
  contactsProxyToParent: number;
  contactsSkippedAlreadySent: number;
  digestVersion: number;
}

export interface StelliumPerfCampaignDashboard {
  lastPrepare: StelliumPerfLastPrepareSnapshot | null;
  readyCount: number;
  sentSincePrepare: number;
  currentDigestVersion: number;
}

function normalizePrepareInput(raw: {
  periode?: string;
  releveDateUnix?: number;
  releve_date_unix?: number;
  investissementIds?: number[];
  investissement_ids?: number[];
}): PrepareStelliumPerfCampaignInput {
  const releveDateUnix = Number(raw.releveDateUnix ?? raw.releve_date_unix);
  const investissementIds = (raw.investissementIds ?? raw.investissement_ids) as number[];
  return {
    periode: String(raw.periode ?? ""),
    releveDateUnix,
    investissementIds: Array.isArray(investissementIds) ? investissementIds : [],
  };
}

function normalizeDiscoverResponse(
  raw: (DiscoverStelliumPerfCampaignPrepareResponse & Record<string, unknown>) | null
): DiscoverStelliumPerfCampaignPrepareResponse | null {
  if (!raw) return null;
  const investissementIds = (raw.investissementIds ?? raw.investissement_ids) as
    | number[]
    | undefined;
  if (!investissementIds?.length) return null;
  const releveDateUnix = Number(raw.releveDateUnix ?? raw.releve_date_unix);
  if (!Number.isFinite(releveDateUnix)) return null;
  return {
    periode: String(raw.periode ?? ""),
    releveDateUnix,
    investissementIds,
    contractCount: Number(raw.contractCount ?? raw.contract_count ?? investissementIds.length),
  };
}

function normalizePrepareResult(
  raw: PrepareStelliumPerfCampaignResult & Record<string, unknown>
): PrepareStelliumPerfCampaignResult {
  return {
    periode: String(raw.periode ?? ""),
    batchKey: String(raw.batchKey ?? raw.batch_key ?? ""),
    contactsMatched: Number(raw.contactsMatched ?? raw.contacts_matched ?? 0),
    contactsQueued: Number(raw.contactsQueued ?? raw.contacts_queued ?? 0),
    contactsNoEmail: Number(raw.contactsNoEmail ?? raw.contacts_no_email ?? 0),
    contactsProxyToParent: Number(
      raw.contactsProxyToParent ?? raw.contacts_proxy_to_parent ?? 0
    ),
    contactsSkippedAlreadySent: Number(
      raw.contactsSkippedAlreadySent ?? raw.contacts_skipped_already_sent ?? 0
    ),
    message: String(raw.message ?? ""),
  };
}

function normalizeStelliumDashboard(
  raw: StelliumPerfCampaignDashboard & Record<string, unknown>
): StelliumPerfCampaignDashboard {
  const lastRaw = (raw.lastPrepare ?? raw.last_prepare) as
    | (StelliumPerfLastPrepareSnapshot & Record<string, unknown>)
    | null
    | undefined;
  const lastPrepare = lastRaw
    ? {
        periode: String(lastRaw.periode ?? ""),
        batchKey: String(lastRaw.batchKey ?? lastRaw.batch_key ?? ""),
        preparedAt: Number(lastRaw.preparedAt ?? lastRaw.prepared_at ?? 0),
        contractCount: Number(lastRaw.contractCount ?? lastRaw.contract_count ?? 0),
        contactsMatched: Number(lastRaw.contactsMatched ?? lastRaw.contacts_matched ?? 0),
        contactsQueued: Number(lastRaw.contactsQueued ?? lastRaw.contacts_queued ?? 0),
        contactsNoEmail: Number(lastRaw.contactsNoEmail ?? lastRaw.contacts_no_email ?? 0),
        contactsProxyToParent: Number(
          lastRaw.contactsProxyToParent ?? lastRaw.contacts_proxy_to_parent ?? 0
        ),
        contactsSkippedAlreadySent: Number(
          lastRaw.contactsSkippedAlreadySent ?? lastRaw.contacts_skipped_already_sent ?? 0
        ),
        digestVersion: Number(lastRaw.digestVersion ?? lastRaw.digest_version ?? 0),
      }
    : null;
  return {
    lastPrepare,
    readyCount: Number(raw.readyCount ?? raw.ready_count ?? 0),
    sentSincePrepare: Number(raw.sentSincePrepare ?? raw.sent_since_prepare ?? 0),
    currentDigestVersion: Number(
      raw.currentDigestVersion ?? raw.current_digest_version ?? 0
    ),
  };
}

export async function ensureStelliumPerfEmailTemplates(): Promise<void> {
  await invoke("ensure_stellium_perf_email_templates");
}

export async function discoverStelliumPerfCampaignPrepareInput(): Promise<DiscoverStelliumPerfCampaignPrepareResponse | null> {
  const raw = await invoke<DiscoverStelliumPerfCampaignPrepareResponse | null>(
    "discover_stellium_perf_campaign_prepare_input"
  );
  return normalizeDiscoverResponse(
    raw as DiscoverStelliumPerfCampaignPrepareResponse & Record<string, unknown> | null
  );
}

export async function prepareStelliumPerfCampaign(
  input: PrepareStelliumPerfCampaignInput
): Promise<PrepareStelliumPerfCampaignResult> {
  const normalized = normalizePrepareInput(input);
  if (!Number.isFinite(normalized.releveDateUnix)) {
    throw new Error("releveDateUnix manquant pour la campagne Stellium");
  }
  const raw = await invoke<PrepareStelliumPerfCampaignResult>("prepare_stellium_perf_campaign", {
    input: normalized,
  });
  return normalizePrepareResult(raw as PrepareStelliumPerfCampaignResult & Record<string, unknown>);
}

export async function getStelliumPerfCampaignDashboard(): Promise<StelliumPerfCampaignDashboard> {
  const raw = await invoke<StelliumPerfCampaignDashboard>(
    "get_stellium_perf_campaign_dashboard_cmd"
  );
  return normalizeStelliumDashboard(raw as StelliumPerfCampaignDashboard & Record<string, unknown>);
}

export function discoverResponseToPrepareInput(
  draft: DiscoverStelliumPerfCampaignPrepareResponse
): PrepareStelliumPerfCampaignInput {
  return normalizePrepareInput(draft);
}
