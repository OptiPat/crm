import { invoke } from "@tauri-apps/api/core";
import type {
  MicrosoftTeamConnectionStatus,
  SharePointConnectionTestResult,
  TeamMigrationPreview,
  TeamMigrationUploadReport,
  TeamMigrationValidateReport,
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
  TeamMigrationTableCount,
  TeamRole,
  WorkspaceConfig,
  WorkspaceConfigResponse,
  WorkspaceMode,
} from "@/lib/team/team-capabilities";

export const TEAM_WORKSPACE_CHANGED_EVENT = "team-workspace-changed";

export function notifyTeamWorkspaceChanged(): void {
  window.dispatchEvent(new CustomEvent(TEAM_WORKSPACE_CHANGED_EVENT));
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
