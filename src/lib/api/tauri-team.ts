import { invoke } from "@tauri-apps/api/core";
import type {
  MicrosoftTeamConnectionStatus,
  SharePointConnectionTestResult,
  TeamMigrationPreview,
  TeamMigrationUploadReport,
  TeamMigrationValidateReport,
  TeamCacheRebuildReport,
  TeamSyncActivationReport,
  TeamSyncConflict,
  TeamSyncOnceReport,
  WorkspaceConfig,
  WorkspaceConfigResponse,
} from "@/lib/team/team-capabilities";

export type {
  MicrosoftTeamConnectionStatus,
  SharePointConnectionTestResult,
  TeamCapabilities,
  TeamMigrationPreview,
  TeamMigrationUploadError,
  TeamMigrationUploadReport,
  TeamMigrationValidateReport,
  TeamCacheRebuildReport,
  TeamMigrationTableCount,
  TeamRole,
  TeamSyncActivationReport,
  TeamSyncConflict,
  TeamSyncOnceReport,
  WorkspaceConfig,
  WorkspaceConfigResponse,
  WorkspaceMode,
} from "@/lib/team/team-capabilities";

export const TEAM_WORKSPACE_CHANGED_EVENT = "team-workspace-changed";

export function notifyTeamWorkspaceChanged(): void {
  window.dispatchEvent(new CustomEvent(TEAM_WORKSPACE_CHANGED_EVENT));
}

export function notifySharedCrmDataChanged(): void {
  [
    "crm:contacts-changed",
    "crm:foyers-changed",
    "crm:partenaires-changed",
    "crm:investissements-changed",
    "crm:documents-changed",
    "crm:custom-fields-changed",
    "crm:taches-changed",
    "crm:templates-email-changed",
    "crm:interactions-changed",
    "crm:alertes-changed",
    "crm:etiquettes-changed",
    "crm:pipe-changed",
    "crm-notes-changed",
    "placement-operations-changed",
  ].forEach((eventName) => window.dispatchEvent(new CustomEvent(eventName)));
}

export async function getWorkspaceConfig(): Promise<WorkspaceConfigResponse> {
  return invoke<WorkspaceConfigResponse>("get_workspace_config_cmd");
}

export async function saveWorkspaceConfig(
  config: WorkspaceConfig
): Promise<WorkspaceConfigResponse> {
  const response = await invoke<WorkspaceConfigResponse>("save_workspace_config_cmd", {
    config,
  });
  notifyTeamWorkspaceChanged();
  return response;
}

export async function getMicrosoftTeamConnectionStatus(): Promise<MicrosoftTeamConnectionStatus> {
  return invoke<MicrosoftTeamConnectionStatus>("get_microsoft_team_connection_status");
}

export async function connectMicrosoftTeamOAuth(options?: {
  forceConsent?: boolean;
}): Promise<MicrosoftTeamConnectionStatus> {
  return invoke<MicrosoftTeamConnectionStatus>("connect_microsoft_team_oauth_cmd", {
    forceConsent: options?.forceConsent ?? null,
  });
}

export async function disconnectMicrosoftTeamOAuth(): Promise<void> {
  await invoke<void>("disconnect_microsoft_team_oauth_cmd");
}

export async function testMicrosoftTeamSharePointConnection(options?: {
  siteHostname?: string;
  sitePath?: string;
}): Promise<SharePointConnectionTestResult> {
  return invoke<SharePointConnectionTestResult>(
    "test_microsoft_team_sharepoint_connection_cmd",
    {
      siteHostname: options?.siteHostname?.trim() || null,
      sitePath: options?.sitePath?.trim() || null,
    }
  );
}

export async function previewTeamMigration(): Promise<TeamMigrationPreview> {
  return invoke<TeamMigrationPreview>("preview_team_migration_cmd");
}

export async function uploadTeamMigrationSnapshot(
  expectedChecksum: string
): Promise<TeamMigrationUploadReport> {
  return invoke<TeamMigrationUploadReport>("upload_team_migration_snapshot_cmd", {
    expectedChecksum,
  });
}

export async function validateTeamRemoteSnapshot(
  expectedChecksum: string
): Promise<TeamMigrationValidateReport> {
  return invoke<TeamMigrationValidateReport>("validate_team_remote_snapshot_cmd", {
    expectedChecksum,
  });
}

export async function activateTeamSync(): Promise<TeamSyncActivationReport> {
  const report = await invoke<TeamSyncActivationReport>("activate_team_sync_cmd");
  notifyTeamWorkspaceChanged();
  return report;
}

export async function bootstrapTeamSync(): Promise<TeamSyncActivationReport> {
  const report = await invoke<TeamSyncActivationReport>("bootstrap_team_sync_cmd");
  notifyTeamWorkspaceChanged();
  return report;
}

export async function rebuildTeamCacheFromSharePoint(): Promise<TeamCacheRebuildReport> {
  const report = await invoke<TeamCacheRebuildReport>(
    "rebuild_team_cache_from_sharepoint_cmd"
  );
  notifySharedCrmDataChanged();
  return report;
}

export async function syncTeamWorkspaceOnce(): Promise<TeamSyncOnceReport> {
  return invoke<TeamSyncOnceReport>("team_sync_once_cmd");
}

export async function listTeamSyncConflicts(): Promise<TeamSyncConflict[]> {
  return invoke<TeamSyncConflict[]>("list_team_sync_conflicts_cmd");
}

export async function resolveTeamSyncConflictKeepLocal(conflictId: number): Promise<void> {
  await invoke<void>("resolve_team_sync_conflict_keep_local_cmd", { conflictId });
}

export async function resolveTeamSyncConflictAcceptRemote(conflictId: number): Promise<void> {
  await invoke<void>("resolve_team_sync_conflict_accept_remote_cmd", { conflictId });
}
