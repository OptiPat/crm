import { invoke } from "@tauri-apps/api/core";

export type PlacementOperationStatus = "PENDING" | "CONFORME" | "NON_CONFORME";

export type PlacementOperationType =
  | "ARBITRAGE"
  | "VERSEMENT"
  | "REINVESTISSEMENT"
  | "SOUSCRIPTION"
  | "AUTRE";

export interface PlacementOperation {
  id: number;
  contact_id: number;
  pipe_id?: number | null;
  pipe_timeline_entry_id?: number | null;
  operation_type: PlacementOperationType | string;
  product_label?: string | null;
  stellium_label?: string | null;
  status: PlacementOperationStatus | string;
  gmail_message_id?: string | null;
  email_subject?: string | null;
  email_received_at?: number | null;
  created_at: number;
  updated_at: number;
  client_notified_at?: number | null;
  non_conforme_at?: number | null;
  partner_resent_at?: number | null;
  dismissed_at?: number | null;
  montant_centimes?: number | null;
  type_produit?: string | null;
  investissement_id?: number | null;
  pv_manual?: number | null;
}

export interface PlacementOperationWithContact {
  operation: PlacementOperation;
  contact_nom: string;
  contact_prenom: string;
  pipe_titre?: string | null;
}

/** Réponse plate depuis Rust (champs aplatis). */
export type PlacementOperationRow = PlacementOperation & {
  contact_nom: string;
  contact_prenom: string;
  pipe_titre?: string | null;
};

export interface BoxPlacementScanResult {
  scanned: number;
  updated: number;
  created: number;
  skipped: number;
  skipped_ambiguous_contacts?: number;
  skipped_ambiguous_placements?: number;
  new_conforme_ids?: number[];
}

export interface PlacementPipeOpenCount {
  pipe_id: number;
  /** Brouillon : acte créé, envoi Stellium pas encore confirmé. */
  unsent: number;
  /** Déclaré envoyé, en attente réponse partenaire. */
  pending: number;
  non_conforme: number;
}

export interface NewPlacementOperationInput {
  contact_id: number;
  pipe_id?: number | null;
  pipe_timeline_entry_id?: number | null;
  operation_type: string;
  product_label?: string | null;
  stellium_label?: string | null;
  montant_centimes?: number | null;
  type_produit?: string | null;
}

export const PLACEMENT_OPERATIONS_CHANGED_EVENT = "placement-operations-changed";

export function notifyPlacementOperationsChanged(): void {
  window.dispatchEvent(new CustomEvent(PLACEMENT_OPERATIONS_CHANGED_EVENT));
}

function normalizePlacementRow(raw: PlacementOperationRow): PlacementOperationWithContact {
  const {
    contact_nom,
    contact_prenom,
    pipe_titre,
    id,
    contact_id,
    pipe_id,
    pipe_timeline_entry_id,
    operation_type,
    product_label,
    stellium_label,
    status,
    gmail_message_id,
    email_subject,
    email_received_at,
    created_at,
    updated_at,
    client_notified_at,
    non_conforme_at,
    partner_resent_at,
    dismissed_at,
    montant_centimes,
    type_produit,
    investissement_id,
    pv_manual,
  } = raw;
  return {
    operation: {
      id,
      contact_id,
      pipe_id,
      pipe_timeline_entry_id,
      operation_type,
      product_label,
      stellium_label,
      status,
      gmail_message_id,
      email_subject,
      email_received_at,
      created_at,
      updated_at,
      client_notified_at,
      non_conforme_at,
      partner_resent_at,
      dismissed_at,
      montant_centimes,
      type_produit,
      investissement_id,
      pv_manual,
    },
    contact_nom,
    contact_prenom,
    pipe_titre,
  };
}

export async function scanBoxPlacementEmails(): Promise<BoxPlacementScanResult> {
  return invoke<BoxPlacementScanResult>("scan_box_placement_emails");
}

export async function createPlacementOperation(
  input: NewPlacementOperationInput
): Promise<PlacementOperation> {
  return invoke<PlacementOperation>("create_placement_operation", { input });
}

export async function listPlacementOperations(
  includeArchived = false
): Promise<PlacementOperationWithContact[]> {
  const raw = await invoke<PlacementOperationRow[]>("list_placement_operations", {
    includeArchived,
  });
  return raw.map(normalizePlacementRow);
}

export async function listPlacementOperationsForPipe(
  pipeId: number
): Promise<PlacementOperation[]> {
  return invoke<PlacementOperation[]>("list_placement_operations_for_pipe", { pipeId });
}

export async function updatePlacementOperationPvManual(
  id: number,
  pvManual: number | null
): Promise<PlacementOperation> {
  const op = await invoke<PlacementOperation>("update_placement_operation_pv_manual", {
    id,
    pv_manual: pvManual,
  });
  notifyPlacementOperationsChanged();
  return op;
}

export async function updatePlacementOperationStatus(
  id: number,
  status: PlacementOperationStatus
): Promise<PlacementOperation> {
  return invoke<PlacementOperation>("update_placement_operation_status", { id, status });
}

export async function getPlacementOperation(id: number): Promise<PlacementOperation> {
  return invoke<PlacementOperation>("get_placement_operation", { id });
}

export async function markPlacementPartnerResent(id: number): Promise<PlacementOperation> {
  return invoke<PlacementOperation>("mark_placement_partner_resent", { id });
}

export async function dismissPlacementOperation(id: number): Promise<PlacementOperation> {
  return invoke<PlacementOperation>("dismiss_placement_operation", { id });
}

export async function markPlacementClientNotified(id: number): Promise<void> {
  return invoke("mark_placement_client_notified", { id });
}

export async function reservePlacementClientNotification(id: number): Promise<boolean> {
  return invoke<boolean>("reserve_placement_client_notification", { id });
}

export async function releasePlacementClientNotification(id: number): Promise<void> {
  return invoke("release_placement_client_notification", { id });
}

export async function getPlacementOpenCountsByPipe(): Promise<PlacementPipeOpenCount[]> {
  return invoke<PlacementPipeOpenCount[]>("get_placement_open_counts_by_pipe");
}
