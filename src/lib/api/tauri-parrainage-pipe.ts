import { invoke } from "@tauri-apps/api/core";
import { notifyContactsChanged } from "@/lib/contacts/contact-events";
import { notifyParrainagePipeChanged } from "@/lib/parrainage-pipe/parrainage-pipe-events";
import type { ParrainageInvitationType, ParrainagePipeStage } from "@/lib/parrainage-pipe/parrainage-pipe-types";

export interface ParrainagePipeRecord {
  id: number;
  contact_id: number;
  stage: ParrainagePipeStage | string;
  invitation_type?: ParrainageInvitationType | string | null;
  exercice_label: string;
  notes?: string | null;
  created_at: number;
  updated_at: number;
  archived_at?: number | null;
  contact_nom?: string | null;
  contact_prenom?: string | null;
  contact_telephone?: string | null;
}

export interface ParrainagePipeTimelineEntry {
  id: number;
  parrainage_pipe_id: number;
  entry_type: string;
  titre?: string | null;
  contenu?: string | null;
  occurred_at: number;
  created_at: number;
}

export interface ParrainageFunnelCounts {
  sms_envoyes: number;
  confirmations: number;
  presences: number;
  parrainages: number;
}

export interface NewParrainagePipeInput {
  contact_id: number;
  exercice_label: string;
  stage?: ParrainagePipeStage | string | null;
  invitation_type?: ParrainageInvitationType | string | null;
  notes?: string | null;
}

export interface UpdateParrainagePipeInput {
  invitation_type?: ParrainageInvitationType | string | null;
  notes?: string | null;
}

function notifyMutations(): void {
  notifyParrainagePipeChanged();
  notifyContactsChanged();
}

export async function listParrainagePipes(
  exerciceLabel: string,
  includeArchived = false
): Promise<ParrainagePipeRecord[]> {
  return invoke<ParrainagePipeRecord[]>("list_parrainage_pipes", {
    exerciceLabel,
    includeArchived,
  });
}

export async function getParrainagePipeById(id: number): Promise<ParrainagePipeRecord> {
  return invoke<ParrainagePipeRecord>("get_parrainage_pipe_by_id", { id });
}

export async function createParrainagePipe(
  input: NewParrainagePipeInput
): Promise<ParrainagePipeRecord> {
  const pipe = await invoke<ParrainagePipeRecord>("create_parrainage_pipe", { input });
  notifyMutations();
  return pipe;
}

export async function updateParrainagePipe(
  id: number,
  update: UpdateParrainagePipeInput
): Promise<ParrainagePipeRecord> {
  const pipe = await invoke<ParrainagePipeRecord>("update_parrainage_pipe", { id, update });
  notifyMutations();
  return pipe;
}

export async function setParrainagePipeStage(
  id: number,
  stage: ParrainagePipeStage,
  options?: { invitationType?: ParrainageInvitationType | null; notes?: string | null }
): Promise<ParrainagePipeRecord> {
  const pipe = await invoke<ParrainagePipeRecord>("set_parrainage_pipe_stage", {
    id,
    stage,
    invitationType: options?.invitationType ?? null,
    notes: options?.notes ?? null,
  });
  notifyMutations();
  return pipe;
}

export async function deleteParrainagePipe(id: number): Promise<void> {
  await invoke<void>("delete_parrainage_pipe", { id });
  notifyMutations();
}

export async function listParrainagePipeTimelineEntries(
  parrainagePipeId: number
): Promise<ParrainagePipeTimelineEntry[]> {
  return invoke<ParrainagePipeTimelineEntry[]>("list_parrainage_pipe_timeline_entries", {
    parrainagePipeId,
  });
}

export async function createParrainagePipeTimelineNote(
  parrainagePipeId: number,
  contenu: string
): Promise<ParrainagePipeTimelineEntry> {
  const entry = await invoke<ParrainagePipeTimelineEntry>("create_parrainage_pipe_timeline_note", {
    parrainagePipeId,
    contenu,
  });
  notifyParrainagePipeChanged();
  return entry;
}

export async function createParrainagePipeSmsSentNote(
  parrainagePipeId: number,
  contenu: string
): Promise<ParrainagePipeTimelineEntry> {
  const entry = await invoke<ParrainagePipeTimelineEntry>("create_parrainage_pipe_sms_sent_note", {
    parrainagePipeId,
    contenu,
  });
  notifyParrainagePipeChanged();
  return entry;
}

export async function getParrainageFunnelCounts(
  exerciceLabel: string
): Promise<ParrainageFunnelCounts> {
  return invoke<ParrainageFunnelCounts>("get_parrainage_funnel_counts", { exerciceLabel });
}
