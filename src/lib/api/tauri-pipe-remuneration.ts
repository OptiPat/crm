import { invoke } from "@tauri-apps/api/core";

export interface PipeRemunerationRow {
  pipe_id: number;
  pipe_titre: string;
  contact_id: number;
  contact_prenom?: string | null;
  contact_nom?: string | null;
  placement_operation_id: number;
  montant_centimes: number;
  type_produit?: string | null;
  pv_manual?: number | null;
  product_label?: string | null;
  investissement_id?: number | null;
  date_souscription?: number | null;
}

export async function listPipeRemunerationRows(): Promise<PipeRemunerationRow[]> {
  return invoke<PipeRemunerationRow[]>("list_pipe_remuneration_rows");
}
