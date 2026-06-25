import { invoke } from "@tauri-apps/api/core";
import { notifyTemplatesEmailChanged } from "@/lib/emails/template-events";
import { notifyEtiquettesChanged } from "@/lib/etiquettes/etiquette-events";
import type { EphemeralCampaignAudience } from "@/lib/emails/template-email-ephemeral";
export interface EphemeralCampaignAudienceMember {
  contact_id: number;
  nom: string;
  prenom: string;
  email: string | null;
  matched_produits: string[];
  excluded: boolean;
  has_email: boolean;
}

export interface EphemeralCampaignAudiencePreview {
  eligible_count: number;
  excluded_count: number;
  no_email_count: number;
  queued_count: number;
  members: EphemeralCampaignAudienceMember[];
}

export interface SyncEphemeralCampaignResult {
  batch_key: string;
  contacts_matched: number;
  contacts_queued: number;
  contacts_cancelled: number;
  contacts_no_email: number;
  auto_archived: boolean;
  message: string;
}

export async function previewEphemeralCampaignAudience(
  templateId: number
): Promise<EphemeralCampaignAudiencePreview> {
  return invoke<EphemeralCampaignAudiencePreview>("preview_ephemeral_campaign_audience", {
    templateId,
  });
}

export async function syncEphemeralCampaignQueue(
  templateId: number
): Promise<SyncEphemeralCampaignResult> {
  const result = await invoke<SyncEphemeralCampaignResult>("sync_ephemeral_campaign_queue", {
    templateId,
  });
  notifyTemplatesEmailChanged();
  notifyEtiquettesChanged();
  return result;
}

export async function archiveEphemeralCampaign(templateId: number): Promise<void> {
  await invoke<void>("archive_ephemeral_campaign", { templateId });
  notifyTemplatesEmailChanged();
  notifyEtiquettesChanged();
}

export type { EphemeralCampaignAudience };
