import { invoke } from "@tauri-apps/api/core";

export type PipelineStatus = "A_TRAITER" | "MAIL_ENVOYE" | "RDV_PRIS" | "TERMINE";

export interface EtiquettePipelineContact {
  contact_etiquette_id: number;
  contact_id: number;
  contact_prenom: string;
  contact_nom: string;
  email_envoye: boolean;
  email_date_envoi: number | null;
  pipeline_status: PipelineStatus;
}

export interface EtiquettePipelineBoard {
  etiquette_id: number;
  contacts: EtiquettePipelineContact[];
}

export const PIPELINE_STATUS_LABELS: Record<PipelineStatus, string> = {
  A_TRAITER: "À traiter",
  MAIL_ENVOYE: "Mail envoyé",
  RDV_PRIS: "RDV pris",
  TERMINE: "Terminé",
};

export const PIPELINE_STATUS_ORDER: PipelineStatus[] = [
  "A_TRAITER",
  "MAIL_ENVOYE",
  "RDV_PRIS",
  "TERMINE",
];

export async function setEtiquettePipelineActif(
  etiquetteId: number,
  actif: boolean
): Promise<void> {
  return invoke<void>("set_etiquette_pipeline_actif", { etiquetteId, actif });
}

export async function getEtiquettePipelineBoard(
  etiquetteId: number
): Promise<EtiquettePipelineBoard> {
  return invoke<EtiquettePipelineBoard>("get_etiquette_pipeline_board", { etiquetteId });
}

export async function setContactPipelineStatus(
  contactEtiquetteId: number,
  status: PipelineStatus
): Promise<void> {
  return invoke<void>("set_contact_pipeline_status", { contactEtiquetteId, status });
}
