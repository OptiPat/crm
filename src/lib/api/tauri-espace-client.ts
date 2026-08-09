import { invoke } from "@tauri-apps/api/core";
import { notifyEspaceClientChanged } from "@/lib/espace-client/espace-client-events";

export interface EspaceAcces {
  contact_id: number;
  statut: string;
  email_utilise?: string | null;
  active_at?: number | null;
  revoked_at?: number | null;
  derniere_connexion?: number | null;
  premiere_connexion_at?: number | null;
  created_at: number;
  updated_at: number;
}

export interface EspaceConnexionLogEntry {
  id: number;
  contact_id: number;
  event: string;
  detail?: string | null;
  ip?: string | null;
  user_agent?: string | null;
  created_at: number;
}

export interface EspaceSyncSummary {
  derniere_synchro_at?: number | null;
  dernier_statut?: string | null;
}

export interface EspaceClientSyncConfig {
  portal_url?: string | null;
  has_sync_secret: boolean;
}

export interface PushEspaceClientContactResult {
  sequence: number;
  investissement_count: number;
  timeline_count: number;
}

export async function getEspaceAcces(
  contactId: number
): Promise<EspaceAcces | null> {
  return invoke<EspaceAcces | null>("get_espace_acces_cmd", { contactId });
}

export interface EspaceActivationResult {
  acces: EspaceAcces;
  /** Code a dicter au client : affiche une seule fois, jamais reconsultable. */
  activationCode: string;
}

export async function activateEspaceAcces(
  contactId: number,
  email: string
): Promise<EspaceActivationResult> {
  const result = await invoke<EspaceActivationResult>(
    "activate_espace_acces_cmd",
    { contactId, email }
  );
  notifyEspaceClientChanged();
  return result;
}

export async function revokeEspaceAcces(
  contactId: number
): Promise<EspaceAcces> {
  const acces = await invoke<EspaceAcces>("revoke_espace_acces_cmd", {
    contactId,
  });
  notifyEspaceClientChanged();
  return acces;
}

export async function getEspaceConnexionLog(
  contactId: number
): Promise<EspaceConnexionLogEntry[]> {
  return invoke<EspaceConnexionLogEntry[]>("get_espace_connexion_log_cmd", {
    contactId,
  });
}

export async function getEspaceSyncSummary(): Promise<EspaceSyncSummary> {
  return invoke<EspaceSyncSummary>("get_espace_sync_summary_cmd");
}

export async function getEspaceClientSyncConfig(): Promise<EspaceClientSyncConfig> {
  return invoke<EspaceClientSyncConfig>("get_espace_client_sync_config_cmd");
}

export async function saveEspaceClientSyncConfig(
  portalUrl: string,
  syncSecret?: string
): Promise<EspaceClientSyncConfig> {
  const config = await invoke<EspaceClientSyncConfig>(
    "save_espace_client_sync_config_cmd",
    {
      portalUrl,
      syncSecret: syncSecret?.trim() || null,
    }
  );
  notifyEspaceClientChanged();
  return config;
}

export async function pushEspaceClientContact(
  contactId: number
): Promise<PushEspaceClientContactResult> {
  const result = await invoke<PushEspaceClientContactResult>(
    "push_espace_client_contact_cmd",
    { contactId }
  );
  notifyEspaceClientChanged();
  return result;
}
