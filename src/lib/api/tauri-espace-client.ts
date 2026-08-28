import { invoke } from "@tauri-apps/api/core";
import { notifyEspaceClientChanged } from "@/lib/espace-client/espace-client-events";
import { notifyInvestissementsChanged } from "@/lib/investissements/investissement-events";
import type { EspaceClientTimelineEventDto } from "@/lib/espace-client/espace-timeline";
import type { ValorisationPointDto } from "@/lib/espace-client/espace-valorisations";

export interface EspaceAcces {
  contact_id: number;
  statut: string;
  email_utilise?: string | null;
  active_at?: number | null;
  revoked_at?: number | null;
  derniere_connexion?: number | null;
  premiere_connexion_at?: number | null;
  created_at: number;
  updated_at: number;
}

export interface EspaceConnexionLogEntry {
  id: number;
  contact_id: number;
  event: string;
  detail?: string | null;
  ip?: string | null;
  user_agent?: string | null;
  created_at: number;
}

export interface EspaceSyncSummary {
  derniere_synchro_at?: number | null;
  dernier_statut?: string | null;
}

export interface EspaceClientSyncConfig {
  portal_url?: string | null;
  has_sync_secret: boolean;
  /** Lien d'agenda du bouton permanent, choisi parmi ceux des réglages. */
  rdv_lien_id?: string | null;
  /** Mobile WhatsApp du cabinet. Vide = pas de bouton flottant. */
  whatsapp_telephone?: string | null;
}

export interface PushEspaceClientContactResult {
  sequence: number;
  investissement_count: number;
  timeline_count: number;
}

export interface EspaceDemande {
  id: number;
  contact_id: number;
  type_document: string;
  template_key?: string | null;
  libelle: string;
  statut: string;
  demande_at: number;
  recu_at?: number | null;
  valide_at?: number | null;
  annule_at?: number | null;
  created_at: number;
  updated_at: number;
}

export interface ImportEspaceDepotsResult {
  imported: number;
  documentIds: number[];
  scpiDeclarationsImported: number;
  avoirsImported: number;
  avoirsRetires: number;
  declareClientPromoted: number;
  errors: string[];
}

export interface EspaceScpiDeclarationPending {
  id: number;
  investissementId: number;
  dateTs: number;
  valorisationCentimes: number;
  revenuPercuCentimes?: number | null;
  createdAt: number;
}

export async function listEspaceScpiDeclarationsPending(
  contactId: number
): Promise<EspaceScpiDeclarationPending[]> {
  return invoke<EspaceScpiDeclarationPending[]>(
    "list_espace_scpi_declarations_pending_cmd",
    { contactId }
  );
}

export interface EspaceAvoirPendingCounts {
  declarations: number;
  retraits: number;
}

export async function listEspaceAvoirPending(
  contactId: number
): Promise<EspaceAvoirPendingCounts> {
  return invoke<EspaceAvoirPendingCounts>("list_espace_avoir_pending_cmd", {
    contactId,
  });
}

/**
 * Ce que le client verra : la timeline et le bouton de rendez-vous, construits
 * par le même moteur que la synchronisation.
 */
export interface EspaceClientPreviewDemande {
  id: number;
  libelle: string;
  typeDocument: string;
  demandeAt: number;
}

export interface EspaceClientPreview {
  timeline: EspaceClientTimelineEventDto[];
  valorisations: ValorisationPointDto[];
  demandes: EspaceClientPreviewDemande[];
  rdvUrl: string | null;
  whatsappUrl: string | null;
}

export async function buildEspaceClientPreview(
  contactId: number
): Promise<EspaceClientPreview> {
  return invoke<EspaceClientPreview>("build_espace_client_preview_cmd", {
    contactId,
  });
}

/** Échéance rédigée par le conseiller à destination d'un client. */
export interface EspaceEcheance {
  id: number;
  contact_id: number;
  date_echeance: number;
  titre: string;
  message: string | null;
  rdv_lien_id: string | null;
  created_at: number;
  updated_at: number;
}

export async function listEspaceEcheances(
  contactId: number
): Promise<EspaceEcheance[]> {
  return invoke<EspaceEcheance[]>("list_espace_echeances_cmd", { contactId });
}

export async function createEspaceEcheance(
  contactId: number,
  dateEcheance: number,
  titre: string,
  message: string | null,
  rdvLienId: string | null
): Promise<EspaceEcheance> {
  const echeance = await invoke<EspaceEcheance>("create_espace_echeance_cmd", {
    contactId,
    dateEcheance,
    titre,
    message,
    rdvLienId,
  });
  notifyEspaceClientChanged();
  return echeance;
}

export async function deleteEspaceEcheance(id: number): Promise<void> {
  await invoke<void>("delete_espace_echeance_cmd", { id });
  notifyEspaceClientChanged();
}

export async function listEspaceDemandes(
  contactId: number
): Promise<EspaceDemande[]> {
  return invoke<EspaceDemande[]>("list_espace_demandes_cmd", { contactId });
}

export async function createEspaceDemande(
  contactId: number,
  typeDocument: string,
  templateKey: string | null,
  libelle: string
): Promise<EspaceDemande> {
  const demande = await invoke<EspaceDemande>("create_espace_demande_cmd", {
    contactId,
    typeDocument,
    templateKey,
    libelle,
  });
  notifyEspaceClientChanged();
  return demande;
}

export async function cancelEspaceDemande(
  demandeId: number
): Promise<EspaceDemande> {
  const demande = await invoke<EspaceDemande>("cancel_espace_demande_cmd", {
    demandeId,
  });
  notifyEspaceClientChanged();
  return demande;
}

export async function importEspaceDepots(
  contactId: number
): Promise<ImportEspaceDepotsResult> {
  const result = await invoke<ImportEspaceDepotsResult>("import_espace_depots_cmd", {
    contactId,
  });
  notifyEspaceClientChanged();
  if (
    result.scpiDeclarationsImported > 0 ||
    result.avoirsImported > 0 ||
    result.avoirsRetires > 0 ||
    result.declareClientPromoted > 0
  ) {
    notifyInvestissementsChanged();
  }
  return result;
}

export interface ImportEspaceDepotsAllResult {
  total: number;
  reussis: number;
  imported: number;
  scpiDeclarationsImported: number;
  avoirsImported: number;
  avoirsRetires: number;
  declareClientPromoted: number;
  echecs: string[];
}

export async function importAllEspaceDepots(): Promise<ImportEspaceDepotsAllResult> {
  const result = await invoke<ImportEspaceDepotsAllResult>(
    "import_all_espace_depots_cmd"
  );
  notifyEspaceClientChanged();
  if (
    result.scpiDeclarationsImported > 0 ||
    result.avoirsImported > 0 ||
    result.avoirsRetires > 0 ||
    result.declareClientPromoted > 0
  ) {
    notifyInvestissementsChanged();
  }
  return result;
}

export async function getEspaceAcces(
  contactId: number
): Promise<EspaceAcces | null> {
  return invoke<EspaceAcces | null>("get_espace_acces_cmd", { contactId });
}

export interface EspaceActivationResult {
  acces: EspaceAcces;
  /** Code a dicter au client : affiche une seule fois, jamais reconsultable. */
  activationCode: string;
}

export async function activateEspaceAcces(
  contactId: number,
  email: string
): Promise<EspaceActivationResult> {
  const result = await invoke<EspaceActivationResult>(
    "activate_espace_acces_cmd",
    { contactId, email }
  );
  notifyEspaceClientChanged();
  return result;
}

export async function revokeEspaceAcces(
  contactId: number
): Promise<EspaceAcces> {
  const acces = await invoke<EspaceAcces>("revoke_espace_acces_cmd", {
    contactId,
  });
  notifyEspaceClientChanged();
  return acces;
}

export async function getEspaceConnexionLog(
  contactId: number
): Promise<EspaceConnexionLogEntry[]> {
  return invoke<EspaceConnexionLogEntry[]>("get_espace_connexion_log_cmd", {
    contactId,
  });
}

export async function getEspaceSyncSummary(): Promise<EspaceSyncSummary> {
  return invoke<EspaceSyncSummary>("get_espace_sync_summary_cmd");
}

export async function getEspaceClientSyncConfig(): Promise<EspaceClientSyncConfig> {
  return invoke<EspaceClientSyncConfig>("get_espace_client_sync_config_cmd");
}

export async function saveEspaceClientSyncConfig(
  portalUrl: string,
  syncSecret?: string,
  rdvLienId?: string | null
): Promise<EspaceClientSyncConfig> {
  const config = await invoke<EspaceClientSyncConfig>(
    "save_espace_client_sync_config_cmd",
    {
      portalUrl,
      syncSecret: syncSecret?.trim() || null,
      // Chaîne vide volontaire : « aucun bouton », distinct de « inchangé ».
      rdvLienId: rdvLienId ?? null,
    }
  );
  notifyEspaceClientChanged();
  return config;
}

export async function saveEspaceClientWhatsApp(
  telephone: string
): Promise<EspaceClientSyncConfig> {
  const config = await invoke<EspaceClientSyncConfig>(
    "save_espace_client_whatsapp_cmd",
    { telephone }
  );
  notifyEspaceClientChanged();
  return config;
}

export interface PushEspaceClientAllResult {
  total: number;
  reussis: number;
  echecs: string[];
}

export async function pushAllEspaceClients(): Promise<PushEspaceClientAllResult> {
  const result = await invoke<PushEspaceClientAllResult>(
    "push_all_espace_clients_cmd"
  );
  notifyEspaceClientChanged();
  return result;
}

export async function pushEspaceClientContact(
  contactId: number
): Promise<PushEspaceClientContactResult> {
  const result = await invoke<PushEspaceClientContactResult>(
    "push_espace_client_contact_cmd",
    { contactId }
  );
  notifyEspaceClientChanged();
  return result;
}

export interface EspaceBroadcastPreview {
  actifs: number;
  avisADemander: number;
  avisDejaTraites: number;
  avisEnAttente: number;
  echeanceACreer: number;
  echeanceIgnores: number;
}

export interface EspaceBroadcastResult {
  total: number;
  crees: number;
  ignores: number;
  relances: number;
  echecs: string[];
}

export async function previewEspaceBroadcast(
  dateEcheance?: number | null,
  titre?: string | null
): Promise<EspaceBroadcastPreview> {
  return invoke<EspaceBroadcastPreview>("preview_espace_broadcast_cmd", {
    dateEcheance: dateEcheance ?? null,
    titre: titre ?? null,
  });
}

export async function broadcastEspaceEcheance(
  dateEcheance: number,
  titre: string,
  message: string | null,
  rdvLienId: string | null
): Promise<EspaceBroadcastResult> {
  const result = await invoke<EspaceBroadcastResult>(
    "broadcast_espace_echeance_cmd",
    { dateEcheance, titre, message, rdvLienId }
  );
  notifyEspaceClientChanged();
  return result;
}

export async function broadcastEspaceAvisImposition(): Promise<EspaceBroadcastResult> {
  const result = await invoke<EspaceBroadcastResult>(
    "broadcast_espace_avis_imposition_cmd"
  );
  notifyEspaceClientChanged();
  return result;
}
