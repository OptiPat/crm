import { invoke } from "@tauri-apps/api/core";
import { notifyContactsChanged } from "@/lib/contacts/contact-events";
import { notifyClientOneDriveChanged } from "@/lib/client-onedrive/client-onedrive-events";
import { showContactOnedriveAutoCreateToast } from "@/lib/client-onedrive/link-onedrive-toast";
import { notifyEtiquettesChanged } from "@/lib/etiquettes/etiquette-events";
import { runBirthdayTelegramIfDue } from "@/lib/api/tauri-birthday-telegram";

export interface Contact {
  id: number;
  famille_id?: number | null;
  foyer_id?: number;
  role_foyer?: string;
  role_famille?: string;
  categorie: string;
  filleul_categorie?: string | null; // 🔥 Catégorie filleul indépendante
  parrain_id?: number;
  prescripteur_id?: number; // 🔥 Qui a recommandé ce client
  civilite?: string;
  nom: string;
  prenom: string;
  email?: string;
  telephone?: string;
  adresse?: string;
  code_postal?: string;
  ville?: string;
  pays?: string;
  date_naissance?: number;
  lieu_naissance?: string;
  profession?: string;
  situation_familiale?: string;
  regime_matrimonial?: string;
  revenus_annuels?: number;
  charges_emprunts?: number;
  /** Épargne de précaution souhaitée (RIO, par personne). */
  epargne_precaution_souhaitee?: number;
  statut_occupation_logement?: string;
  objectifs_patrimoniaux?: string;
  // 🔥 Fiscalité : portée par le contact (célibataire) OU synchronisée depuis le foyer.
  tranche_imposition?: string;
  nombre_parts_fiscales?: number;
  revenu_fiscal_reference?: number;
  ir_net_a_payer?: number;
  source_lead?: string;
  profil_risque_sri?: number;
  // 🔥 Dates de suivi CLIENT (indépendantes des filleuls)
  date_dernier_contact?: number;
  date_prochain_suivi?: number;
  // 🔥 Dates de suivi FILLEUL (indépendantes des clients)
  date_dernier_contact_filleul?: number;
  date_prochain_suivi_filleul?: number;
  /** Date du premier RDV (R1). */
  date_r1?: number;
  /** Invitation filleul : JD ou PO. */
  type_invitation_filleul?: string | null;
  date_invitation_filleul?: number;
  /** Date d'inscription réseau filleul. */
  date_inscription_filleul?: number;
  /** 1 = présent, 0 = absent. */
  presence_invitation_filleul?: number | null;
  /** Titre réseau : JUNIOR, CONSULTANT, MANAGER, SENIOR, MAJOR, EXPERT */
  filleul_titre?: string | null;
  /** Qualification : MANAGER, PLANETE, ETOILE, CONSTELLATION, GALAXIE */
  filleul_qualification?: string | null;
  /** Volume réseau propre (euros). */
  filleul_volume?: number | null;
  filleul_volume_manager?: number | null;
  statut_suivi: string;
  /** `VOUS` (défaut) ou `TU` — variante du modèle email lié */
  registre?: string | null;
  notes?: string;
  /** Hors regroupement automatique par nom (onglet Familles). */
  famille_regroupement_exclu?: boolean;
  created_at: number;
  updated_at: number;
}

export interface NewContact {
  famille_id?: number | null;
  foyer_id?: number | null;
  role_foyer?: string | null;
  role_famille?: string | null;
  categorie?: string;
  filleul_categorie?: string | null; // 🔥 Catégorie filleul indépendante
  parrain_id?: number;
  prescripteur_id?: number; // 🔥 Qui a recommandé ce client
  civilite?: string;
  nom: string;
  prenom: string;
  email?: string;
  telephone?: string;
  adresse?: string;
  code_postal?: string;
  ville?: string;
  pays?: string;
  date_naissance?: string;
  lieu_naissance?: string;
  profession?: string;
  situation_familiale?: string;
  regime_matrimonial?: string;
  revenus_annuels?: number;
  charges_emprunts?: number;
  epargne_precaution_souhaitee?: number;
  statut_occupation_logement?: string;
  objectifs_patrimoniaux?: string;
  source_lead?: string;
  profil_risque_sri?: number;
  // 🔥 Dates de suivi CLIENT (indépendantes des filleuls)
  date_dernier_contact?: string;
  date_prochain_suivi?: string;
  // 🔥 Dates de suivi FILLEUL (indépendantes des clients)
  date_dernier_contact_filleul?: string;
  date_prochain_suivi_filleul?: string;
  date_r1?: string;
  type_invitation_filleul?: string | null;
  date_invitation_filleul?: string;
  date_inscription_filleul?: string;
  presence_invitation_filleul?: number | null;
  filleul_titre?: string | null;
  filleul_qualification?: string | null;
  filleul_volume?: number | null;
  filleul_volume_manager?: number | null;
  statut_suivi?: string;
  registre?: string | null;
  notes?: string;
  famille_regroupement_exclu?: boolean;
}

export async function getAllContacts(): Promise<Contact[]> {
  return await invoke<Contact[]>("get_all_contacts");
}

export async function getContactsByFoyer(foyerId: number): Promise<Contact[]> {
  return await invoke<Contact[]>("get_contacts_by_foyer", { foyerId });
}

export async function getContactById(id: number): Promise<Contact> {
  return await invoke<Contact>("get_contact_by_id", { id });
}

export interface CreateContactResult {
  contact: Contact;
  onedriveMessage?: string | null;
  onedriveLinkCreated?: boolean;
}

export async function createContact(
  newContact: NewContact,
  options?: { skipPostSaveHooks?: boolean }
): Promise<Contact> {
  const result = await invoke<CreateContactResult>("create_contact", {
    newContact,
    skipPostSaveHooks: options?.skipPostSaveHooks ?? null,
  });
  showContactOnedriveAutoCreateToast(result.onedriveMessage);
  if (!options?.skipPostSaveHooks) {
    notifyContactsChanged();
    notifyEtiquettesChanged();
  }
  if (result.onedriveLinkCreated) {
    notifyClientOneDriveChanged();
  }
  return result.contact;
}

export async function createContactsBulk(
  newContacts: NewContact[],
  options?: { skipPostSaveHooks?: boolean }
): Promise<Contact[]> {
  return await invoke<Contact[]>("create_contacts_bulk", {
    newContacts,
    skipPostSaveHooks: options?.skipPostSaveHooks ?? null,
  });
}

export async function updateContact(
  id: number,
  contact: NewContact,
  options?: { skipPostSaveHooks?: boolean }
): Promise<Contact> {
  const updated = await invoke<Contact>("update_contact", {
    id,
    contact,
    skipPostSaveHooks: options?.skipPostSaveHooks ?? null,
  });
  if (!options?.skipPostSaveHooks) {
    notifyContactsChanged({ patchedContact: updated });
    notifyEtiquettesChanged();
    void runBirthdayTelegramIfDue().catch((error) => {
      console.error("Rappels Telegram anniversaires:", error);
    });
  }
  return updated;
}

/** Champs fiscaux éditables d'un contact (TMI, parts, RBG, IR net). */
export interface ContactFiscal {
  tranche_imposition?: string;
  nombre_parts_fiscales?: number;
  revenu_fiscal_reference?: number;
  ir_net_a_payer?: number;
}

/**
 * Met à jour uniquement la fiscalité d'un contact (sans toucher au reste).
 * Utilisé pour une personne seule (sans foyer) et pour synchroniser chaque membre
 * quand la fiscalité est éditée au niveau du foyer.
 */
export async function updateContactFiscal(
  id: number,
  fiscal: ContactFiscal,
  options?: { silent?: boolean }
): Promise<Contact> {
  const updated = await invoke<Contact>("update_contact_fiscal", { id, fiscal });
  if (!options?.silent) {
    notifyContactsChanged({ patchedContact: updated });
    notifyEtiquettesChanged();
  }
  return updated;
}

export async function deleteContact(id: number): Promise<void> {
  await invoke<void>("delete_contact", { id });
  notifyContactsChanged({ removedContactId: id });
  notifyEtiquettesChanged();
}

export async function findContactByEmail(email: string): Promise<Contact | null> {
  return await invoke<Contact | null>("find_contact_by_email", { email });
}

export async function getFilleulsByParrain(parrainId: number): Promise<Contact[]> {
  return await invoke<Contact[]>("get_filleuls_by_parrain", { parrainId });
}

export async function findContactByName(nom: string, prenom: string): Promise<Contact | null> {
  return await invoke<Contact | null>("find_contact_by_name", { nom, prenom });
}

// 🔥 Récupérer tous les clients recommandés par un prescripteur
export async function getClientsByPrescripteur(prescripteurId: number): Promise<Contact[]> {
  return await invoke<Contact[]>("get_clients_by_prescripteur", { prescripteurId });
}

// 🔥 Nettoyer les données orphelines (foyers sans membres, investissements sans contact/foyer)
export async function cleanupOrphanedData(): Promise<[number, number]> {
  return await invoke<[number, number]>("cleanup_orphaned_data");
}
