import { invoke } from "@tauri-apps/api/core";

export interface PipeR1ChecklistItemState {
  received: boolean;
  document_id?: number | null;
  no_credit?: boolean | null;
}

export type PipeR1ChecklistItems = Record<string, PipeR1ChecklistItemState>;

export interface PipeR1DocumentChecklist {
  pipe_id: number;
  profile_salarie: boolean;
  profile_chef_entreprise: boolean;
  profile_retraite: boolean;
  profile_revenus_configured: boolean;
  items: PipeR1ChecklistItems;
  updated_at: number;
}

export interface UpdatePipeR1DocumentChecklistInput {
  profile_salarie?: boolean;
  profile_chef_entreprise?: boolean;
  profile_retraite?: boolean;
  profile_revenus_configured?: boolean;
  items?: PipeR1ChecklistItems;
}

export async function getPipeR1DocumentChecklist(
  pipeId: number
): Promise<PipeR1DocumentChecklist> {
  return invoke<PipeR1DocumentChecklist>("get_pipe_r1_document_checklist", { pipeId });
}

export async function updatePipeR1DocumentChecklist(
  pipeId: number,
  update: UpdatePipeR1DocumentChecklistInput
): Promise<PipeR1DocumentChecklist> {
  return invoke<PipeR1DocumentChecklist>("update_pipe_r1_document_checklist", {
    pipeId,
    update,
  });
}

export interface PipeR1MissingDocsSummary {
  pipe_id: number;
  missing_item_keys: string[];
}

export async function listPipeR1MissingDocsSummaries(): Promise<PipeR1MissingDocsSummary[]> {
  return invoke<PipeR1MissingDocsSummary[]>("list_pipe_r1_missing_docs_summaries");
}

export function mergePipeR1ChecklistUpdate(
  current: PipeR1DocumentChecklist,
  update: UpdatePipeR1DocumentChecklistInput
): PipeR1DocumentChecklist {
  let profile_salarie = update.profile_salarie ?? current.profile_salarie;
  let profile_chef_entreprise =
    update.profile_chef_entreprise ?? current.profile_chef_entreprise;
  const profile_retraite = update.profile_retraite ?? current.profile_retraite;
  let profile_revenus_configured =
    update.profile_revenus_configured ?? current.profile_revenus_configured;

  if (update.profile_salarie === true) {
    profile_chef_entreprise = false;
  }
  if (update.profile_chef_entreprise === true) {
    profile_salarie = false;
  }
  if (
    update.profile_salarie !== undefined ||
    update.profile_chef_entreprise !== undefined ||
    update.profile_retraite !== undefined
  ) {
    profile_revenus_configured = true;
  }

  return {
    ...current,
    profile_salarie,
    profile_chef_entreprise,
    profile_retraite,
    profile_revenus_configured,
    items: update.items ?? current.items,
  };
}
