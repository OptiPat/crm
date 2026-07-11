import { invoke } from "@tauri-apps/api/core";
import { notifyPipeChanged } from "@/lib/pipe/pipe-events";
import type { PipeStage, PipeType } from "@/lib/pipe/pipe-types";

export interface PipeRecord {
  id: number;
  contact_id: number;
  pipe_type: PipeType | string;
  parent_pipe_id?: number | null;
  titre: string;
  stage: string;
  notes?: string | null;
  created_at: number;
  updated_at: number;
  contact_nom?: string | null;
  contact_prenom?: string | null;
  parent_titre?: string | null;
}

export interface NewPipeInput {
  contact_id: number;
  pipe_type: PipeType;
  parent_pipe_id?: number | null;
  titre: string;
  stage?: PipeStage | string | null;
  notes?: string | null;
}

export type UpdatePipeInput = NewPipeInput;

export async function listPipes(): Promise<PipeRecord[]> {
  return invoke<PipeRecord[]>("list_pipes");
}

export async function getPipeById(id: number): Promise<PipeRecord> {
  return invoke<PipeRecord>("get_pipe_by_id", { id });
}

export async function createPipe(input: NewPipeInput): Promise<PipeRecord> {
  const pipe = await invoke<PipeRecord>("create_pipe", { newPipe: input });
  notifyPipeChanged();
  return pipe;
}

export async function updatePipe(id: number, input: UpdatePipeInput): Promise<PipeRecord> {
  const pipe = await invoke<PipeRecord>("update_pipe", { id, update: input });
  notifyPipeChanged();
  return pipe;
}

export async function deletePipe(id: number): Promise<void> {
  await invoke<void>("delete_pipe", { id });
  notifyPipeChanged();
}
