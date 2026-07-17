import { invoke } from "@tauri-apps/api/core";

export interface PipeR3ChecklistItemState {
  received: boolean;
  document_id?: number | null;
  no_credit?: boolean | null;
}

export type PipeR3ChecklistItems = Record<string, PipeR3ChecklistItemState>;

export interface PipeR3DocumentChecklist {
  pipe_id: number;
  items: PipeR3ChecklistItems;
  updated_at: number;
}

export interface UpdatePipeR3DocumentChecklistInput {
  items?: PipeR3ChecklistItems;
}

export async function getPipeR3DocumentChecklist(
  pipeId: number
): Promise<PipeR3DocumentChecklist> {
  return invoke<PipeR3DocumentChecklist>("get_pipe_r3_document_checklist", { pipeId });
}

export async function updatePipeR3DocumentChecklist(
  pipeId: number,
  update: UpdatePipeR3DocumentChecklistInput
): Promise<PipeR3DocumentChecklist> {
  return invoke<PipeR3DocumentChecklist>("update_pipe_r3_document_checklist", {
    pipeId,
    update,
  });
}

export interface PipeR3MissingDocsSummary {
  pipe_id: number;
  missing_item_keys: string[];
}

export async function listPipeR3MissingDocsSummaries(): Promise<PipeR3MissingDocsSummary[]> {
  return invoke<PipeR3MissingDocsSummary[]>("list_pipe_r3_missing_docs_summaries");
}

export function mergePipeR3ChecklistUpdate(
  current: PipeR3DocumentChecklist,
  update: UpdatePipeR3DocumentChecklistInput
): PipeR3DocumentChecklist {
  return {
    ...current,
    items: update.items ?? current.items,
  };
}
