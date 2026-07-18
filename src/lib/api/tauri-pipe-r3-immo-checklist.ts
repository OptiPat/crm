import { invoke } from "@tauri-apps/api/core";

export interface PipeR3ImmoChecklistItemState {
  received: boolean;
  document_id?: number | null;
  no_credit?: boolean | null;
}

export type PipeR3ImmoChecklistItems = Record<string, PipeR3ImmoChecklistItemState>;

export interface PipeR3ImmoDocumentChecklist {
  pipe_id: number;
  profile_salarie: boolean;
  profile_chef_entreprise: boolean;
  profile_revenus_configured: boolean;
  emprunteur_personne_morale: boolean;
  revenus_fonciers_hors_micro: boolean;
  revenus_via_sci: boolean;
  projet_vefa: boolean;
  projet_ancien: boolean;
  projet_scpi: boolean;
  items: PipeR3ImmoChecklistItems;
  updated_at: number;
}

export interface UpdatePipeR3ImmoDocumentChecklistInput {
  profile_salarie?: boolean;
  profile_chef_entreprise?: boolean;
  profile_revenus_configured?: boolean;
  emprunteur_personne_morale?: boolean;
  revenus_fonciers_hors_micro?: boolean;
  revenus_via_sci?: boolean;
  projet_vefa?: boolean;
  projet_ancien?: boolean;
  projet_scpi?: boolean;
  items?: PipeR3ImmoChecklistItems;
}

export async function getPipeR3ImmoDocumentChecklist(
  pipeId: number
): Promise<PipeR3ImmoDocumentChecklist> {
  return invoke<PipeR3ImmoDocumentChecklist>("get_pipe_r3_immo_document_checklist", { pipeId });
}

export async function updatePipeR3ImmoDocumentChecklist(
  pipeId: number,
  update: UpdatePipeR3ImmoDocumentChecklistInput
): Promise<PipeR3ImmoDocumentChecklist> {
  return invoke<PipeR3ImmoDocumentChecklist>("update_pipe_r3_immo_document_checklist", {
    pipeId,
    update,
  });
}

export function mergePipeR3ImmoChecklistUpdate(
  current: PipeR3ImmoDocumentChecklist,
  update: UpdatePipeR3ImmoDocumentChecklistInput
): PipeR3ImmoDocumentChecklist {
  return {
    ...current,
    profile_salarie: update.profile_salarie ?? current.profile_salarie,
    profile_chef_entreprise: update.profile_chef_entreprise ?? current.profile_chef_entreprise,
    profile_revenus_configured:
      update.profile_revenus_configured ??
      (update.profile_salarie !== undefined || update.profile_chef_entreprise !== undefined
        ? true
        : current.profile_revenus_configured),
    emprunteur_personne_morale:
      update.emprunteur_personne_morale ?? current.emprunteur_personne_morale,
    revenus_fonciers_hors_micro:
      update.revenus_fonciers_hors_micro ?? current.revenus_fonciers_hors_micro,
    revenus_via_sci: update.revenus_via_sci ?? current.revenus_via_sci,
    projet_vefa: update.projet_vefa ?? current.projet_vefa,
    projet_ancien: update.projet_ancien ?? current.projet_ancien,
    projet_scpi: update.projet_scpi ?? current.projet_scpi,
    items: update.items ?? current.items,
  };
}
