import { invoke } from "@tauri-apps/api/core";

export interface TeamPresenceEntry {
  actorId: string;
  actorDisplayName: string | null;
  entityType: string;
  entityId: string;
  lastSeenAt: string;
}

export interface TeamLockRecord {
  lockKey: string;
  entityType: string;
  entityId: string;
  holderId: string;
  holderDisplayName: string | null;
  expiresAt: string;
  acquiredAt: string;
  itemId: string;
  etag: string;
}

export interface TeamLockAcquireResponse {
  acquired: boolean;
  lock: TeamLockRecord | null;
  heldBy: string | null;
  conflict: unknown | null;
}

export interface TeamAuditEntry {
  itemId: string;
  entityType: string;
  entityId: string;
  actorId: string;
  action: string;
  detail: string | null;
  createdAt: string;
}

export async function provisionTeamWorkspace(): Promise<void> {
  await invoke("provision_team_workspace_cmd");
}

export async function joinTeamWorkspace(): Promise<void> {
  await invoke("join_team_workspace_cmd");
}

export async function teamPresenceHeartbeat(options: {
  entityType: string;
  entityId: string;
}): Promise<TeamPresenceEntry> {
  return invoke<TeamPresenceEntry>("team_presence_heartbeat_cmd", {
    entityType: options.entityType,
    entityId: options.entityId,
  });
}

export async function teamListPresence(options: {
  entityType: string;
  entityId: string;
}): Promise<TeamPresenceEntry[]> {
  return invoke<TeamPresenceEntry[]>("team_list_presence_cmd", {
    entityType: options.entityType,
    entityId: options.entityId,
  });
}

export async function teamAcquireLock(options: {
  entityType: string;
  entityId: string;
}): Promise<TeamLockAcquireResponse> {
  return invoke<TeamLockAcquireResponse>("team_acquire_lock_cmd", {
    entityType: options.entityType,
    entityId: options.entityId,
  });
}

export async function teamRenewLock(options: {
  entityType: string;
  entityId: string;
  etag: string;
}): Promise<TeamLockAcquireResponse> {
  return invoke<TeamLockAcquireResponse>("team_renew_lock_cmd", {
    entityType: options.entityType,
    entityId: options.entityId,
    etag: options.etag,
  });
}

export async function teamReleaseLock(options: {
  entityType: string;
  entityId: string;
}): Promise<void> {
  await invoke<void>("team_release_lock_cmd", {
    entityType: options.entityType,
    entityId: options.entityId,
  });
}

export async function teamAppendAudit(options: {
  entityType: string;
  entityId: string;
  action: string;
  detail?: string | null;
}): Promise<TeamAuditEntry> {
  return invoke<TeamAuditEntry>("team_append_audit_cmd", {
    entityType: options.entityType,
    entityId: options.entityId,
    action: options.action,
    detail: options.detail ?? null,
  });
}

export async function teamListAudit(options: {
  entityType: string;
  entityId: string;
  limit?: number;
}): Promise<TeamAuditEntry[]> {
  return invoke<TeamAuditEntry[]>("team_list_audit_cmd", {
    entityType: options.entityType,
    entityId: options.entityId,
    limit: options.limit ?? null,
  });
}
