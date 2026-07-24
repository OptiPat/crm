export type WorkspaceMode = "local" | "team_sharepoint";

export type TeamRole = "advisor" | "secretary";

export interface WorkspaceConfig {
  mode: WorkspaceMode;
  role?: TeamRole | null;
  siteHostname?: string | null;
  sitePath?: string | null;
  siteId?: string | null;
  siteName?: string | null;
  /** Boîte partagée Microsoft 365 du cabinet (envoi secrétaire / option conseiller). */
  officeMailboxEmail?: string | null;
  /** Groupe Microsoft Entra des conseillers (UUID). */
  advisorGroupId?: string | null;
  /** Groupe Microsoft Entra des secrétaires (UUID). */
  secretaryGroupId?: string | null;
}

export interface TeamCapabilities {
  canExport: boolean;
  canManageMembers: boolean;
  canUsePersonalMailbox: boolean;
}

export interface WorkspaceConfigResponse {
  config: WorkspaceConfig;
  capabilities: TeamCapabilities;
  teamConfigured: boolean;
  effectiveRole: TeamRole;
  identityEmail?: string | null;
  identityDisplayName?: string | null;
  authorityError?: string | null;
  syncActivated: boolean;
}

export interface MicrosoftTeamConnectionStatus {
  connected: boolean;
  email: string | null;
  expiresAt: number | null;
}

export interface SharePointConnectionTestResult {
  siteId: string;
  siteName: string;
  webUrl: string | null;
  listCount: number;
  driveCount: number;
}

export interface TeamMigrationTableCount {
  tableName: string;
  count: number;
}

export interface TeamMigrationPreview {
  schemaVersion: number;
  generatedAt: string;
  tableCounts: TeamMigrationTableCount[];
  totalRecords: number;
  checksumSha256: string;
  warnings: string[];
}

export interface TeamMigrationUploadError {
  tableName: string;
  recordKey: string;
  syncKey: string;
  message: string;
}

export interface TeamMigrationUploadReport {
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: TeamMigrationUploadError[];
  checksum: string;
  complete: boolean;
}

export interface TeamMigrationValidateReport {
  valid: boolean;
  checksum: string;
  expectedChecksum: string;
  checksumMatch: boolean;
  tableCounts: TeamMigrationTableCount[];
  totalRecords: number;
  tombstoneCount: number;
  foreignKeyOk: boolean;
  integrityOk: boolean;
  errors: string[];
}

export interface TeamSyncActivationReport {
  activated: boolean;
  synchronizedRecords: number;
  reservedIdBlocks: number;
}

export interface TeamCacheRebuildReport {
  rebuilt: boolean;
  synchronizedRecords: number;
  reservedIdBlocks: number;
}

export interface TeamSyncOnceReport {
  pulled: number;
  pushed: number;
  conflicts: number;
  pending: number;
  deltaLinkUpdated: boolean;
}

export interface TeamSyncConflict {
  id: number;
  tableName: string;
  recordKey: string;
  localPayloadJson: string | null;
  remotePayloadJson: string | null;
  remoteDeleted: boolean;
  createdAt: number;
}

const ADVISOR_CAPABILITIES: TeamCapabilities = {
  canExport: true,
  canManageMembers: true,
  canUsePersonalMailbox: true,
};

const SECRETARY_CAPABILITIES: TeamCapabilities = {
  canExport: false,
  canManageMembers: false,
  canUsePersonalMailbox: false,
};

export function capabilitiesForRole(role: TeamRole): TeamCapabilities {
  return role === "advisor" ? ADVISOR_CAPABILITIES : SECRETARY_CAPABILITIES;
}

export function effectiveTeamRole(config: WorkspaceConfig | null | undefined): TeamRole {
  if (!config || config.mode !== "team_sharepoint") {
    return "advisor";
  }
  return config.role ?? "advisor";
}

/** Sans config ou en mode local : comportement identique au conseiller individuel. */
export function resolveTeamCapabilities(
  config: WorkspaceConfig | null | undefined
): TeamCapabilities {
  return capabilitiesForRole(effectiveTeamRole(config));
}

export function isTeamConfigured(config: WorkspaceConfig | null | undefined): boolean {
  return config?.mode === "team_sharepoint";
}

export function canManageTeamSettings(config: WorkspaceConfig | null | undefined): boolean {
  return resolveTeamCapabilities(config).canManageMembers;
}

export const DEFAULT_WORKSPACE_CONFIG: WorkspaceConfig = {
  mode: "local",
};
