import { invoke } from "@tauri-apps/api/core";
import type { Contact } from "@/lib/api/tauri-contacts";

// ==================== INTERFACES ====================

export interface Etiquette {
  id: number;
  nom: string;
  couleur: string;
  icone: string | null;
  description: string | null;
  priorite: number;
  // Attribution automatique
  auto_condition_type: string | null;    // DELAI_SANS_CONTACT, DATE_APPROCHE, PERIODE_ANNEE, TYPE_PRODUIT
  auto_condition_config: string | null;  // JSON avec les paramètres
  auto_categories: string | null;        // JSON array des catégories concernées
  // Action email
  email_template_id: number | null;
  email_delai_jours: number;
  email_envoi_prevu: number | null;
  email_actif: boolean;
  // Système
  is_default: boolean;
  /** false = désactivée (pas de règle auto ni campagne email) */
  actif: boolean;
  created_at: number;
  updated_at: number;
}

export interface NewEtiquette {
  nom: string;
  couleur?: string;        // Défaut: #3B82F6
  icone?: string | null;
  description?: string | null;
  priorite?: number;       // Défaut: 0
  // Attribution automatique
  auto_condition_type?: string | null;
  auto_condition_config?: string | null;
  auto_categories?: string | null;
  // Action email
  email_template_id?: number | null;
  email_delai_jours?: number; // Défaut: 0 (legacy)
  email_envoi_prevu?: number | null;
  email_actif?: boolean;      // Défaut: false
  // Système
  is_default?: boolean;       // Défaut: false
  actif?: boolean;            // Défaut: true
}

export interface ContactEtiquette {
  id: number;
  contact_id: number;
  etiquette_id: number;
  date_attribution: number;
  attribue_par: string;           // "AUTO" ou "MANUEL"
  // Suivi email
  email_envoye: boolean;
  email_date_prevue: number | null;
  email_date_envoi: number | null;
  notes: string | null;
}

export interface EtiquetteWithCount extends Etiquette {
  contact_count: number;
}

export interface EtiquetteEmailQueueItem {
  contact_etiquette_id: number;
  contact_id: number;
  contact_nom: string;
  contact_prenom: string;
  contact_email: string | null;
  contact_telephone: string | null;
  etiquette_id: number;
  etiquette_nom: string;
  etiquette_couleur: string;
  email_date_prevue: number | null;
  email_date_envoi: number | null;
  template_sujet: string;
  template_corps: string;
  queue_issue: string | null;
}

export type EtiquetteEmailQueueStatus = "ready" | "incomplete" | "sent";

export interface ContactEtiquetteDetails {
  id: number;
  contact_id: number;
  etiquette_id: number;
  etiquette_nom: string;
  etiquette_couleur: string;
  etiquette_icone: string | null;
  date_attribution: number;
  attribue_par: string;
  email_envoye: boolean;
  email_date_prevue: number | null;
  notes: string | null;
}

// ==================== TYPES DE CONDITIONS ====================

export type ConditionType =
  | "DELAI_SANS_CONTACT"
  | "DATE_APPROCHE"
  | "PERIODE_ANNEE"
  | "TYPE_PRODUIT"
  | "DATE_APPROCHE_INVESTISSEMENT"
  | "AGE_APPROCHE";

export interface ConditionDelaiSansContact {
  jours: number;
  /** Défaut true : taguer aussi sans date de dernier contact */
  inclure_sans_date?: boolean;
}

export interface ConditionDateApproche {
  champ:
    | "date_prochain_suivi"
    | "date_prochain_suivi_filleul"
    | "date_dernier_contact_filleul"
    | "date_naissance";
  jours_avant: number;
}

export interface ConditionAgeApproche {
  age: number;
  jours_avant: number;
}

export interface ConditionPeriodeAnnee {
  mois_debut: number;  // 1-12
  mois_fin: number;    // 1-12
}

export interface ConditionTypeProduit {
  types: string[];  // Liste des types de produits
}

export interface ConditionDateApprocheInvestissement {
  champ: "date_fin_demembrement" | "date_fin_pret" | "date_souscription";
  jours_avant: number;
  types_produit?: string[];
}

// ==================== PALETTE DE COULEURS ====================

export const COULEURS_ETIQUETTES = [
  { code: "#EF4444", nom: "Rouge", emoji: "🔴" },
  { code: "#F97316", nom: "Orange", emoji: "🟠" },
  { code: "#EAB308", nom: "Jaune", emoji: "🟡" },
  { code: "#10B981", nom: "Vert", emoji: "🟢" },
  { code: "#3B82F6", nom: "Bleu", emoji: "🔵" },
  { code: "#8B5CF6", nom: "Violet", emoji: "🟣" },
  { code: "#374151", nom: "Gris foncé", emoji: "⚫" },
  { code: "#EC4899", nom: "Rose", emoji: "🩷" },
] as const;

// ==================== FONCTIONS API ====================

/**
 * Récupère toutes les étiquettes
 */
export async function getAllEtiquettes(): Promise<Etiquette[]> {
  return invoke<Etiquette[]>("get_all_etiquettes");
}

/**
 * Récupère toutes les étiquettes avec le compteur de contacts
 */
export async function getAllEtiquettesWithCount(): Promise<EtiquetteWithCount[]> {
  return invoke<EtiquetteWithCount[]>("get_all_etiquettes_with_count");
}

/**
 * Récupère une étiquette par son ID
 */
export async function getEtiquetteById(id: number): Promise<Etiquette> {
  return invoke<Etiquette>("get_etiquette_by_id", { id });
}

/**
 * Crée une nouvelle étiquette
 */
export async function createEtiquette(etiquette: NewEtiquette): Promise<Etiquette> {
  return invoke<Etiquette>("create_etiquette", { newEtiquette: etiquette });
}

/**
 * Met à jour une étiquette existante
 */
export async function updateEtiquette(id: number, etiquette: NewEtiquette): Promise<Etiquette> {
  return invoke<Etiquette>("update_etiquette", { id, etiquette });
}

/**
 * Supprime une étiquette
 */
export async function deleteEtiquette(id: number): Promise<void> {
  return invoke<void>("delete_etiquette", { id });
}

/**
 * Récupère les étiquettes d'un contact
 */
export async function getEtiquettesByContact(contactId: number): Promise<ContactEtiquetteDetails[]> {
  return invoke<ContactEtiquetteDetails[]>("get_etiquettes_by_contact", { contactId });
}

/** Toutes les liaisons contact–étiquette en un seul appel (liste Contacts). */
export async function getAllContactEtiquettesDetails(): Promise<ContactEtiquetteDetails[]> {
  return invoke<ContactEtiquetteDetails[]>("get_all_contact_etiquettes_details");
}

/**
 * Attribue une étiquette à un contact
 */
export async function attribuerEtiquette(
  contactId: number, 
  etiquetteId: number, 
  attribuePar?: string
): Promise<ContactEtiquette> {
  return invoke<ContactEtiquette>("attribuer_etiquette", { 
    contactId, 
    etiquetteId, 
    attribuePar 
  });
}

/**
 * Retire une étiquette d'un contact
 */
export async function retirerEtiquette(contactId: number, etiquetteId: number): Promise<void> {
  return invoke<void>("retirer_etiquette", { contactId, etiquetteId });
}

/**
 * Récupère tous les contacts ayant une étiquette spécifique
 */
export async function getContactsByEtiquette(etiquetteId: number): Promise<Contact[]> {
  return invoke<Contact[]>("get_contacts_by_etiquette", { etiquetteId });
}

/**
 * Crée les étiquettes par défaut (au premier lancement)
 */
export async function seedDefaultEtiquettes(): Promise<number> {
  return invoke<number>("seed_default_etiquettes");
}

/**
 * Vérifie et applique automatiquement les étiquettes selon leurs conditions
 * Retourne le nombre d'étiquettes attribuées
 */
export async function checkAndApplyAutoEtiquettes(): Promise<number> {
  return invoke<number>("check_and_apply_auto_etiquettes");
}

/**
 * File d'envoi manuel par étiquettes
 */
export async function getEtiquetteEmailQueue(
  queueStatus: EtiquetteEmailQueueStatus
): Promise<EtiquetteEmailQueueItem[]> {
  return invoke<EtiquetteEmailQueueItem[]>("get_etiquette_email_queue", {
    queueStatus,
  });
}

/** @deprecated Utiliser getEtiquetteEmailQueue("ready") */
export async function getPendingEtiquetteEmails(): Promise<[number, number, number, string, string][]> {
  return invoke<[number, number, number, string, string][]>("get_pending_etiquette_emails");
}

/**
 * Marque un email d'étiquette comme envoyé
 */
export async function markEtiquetteEmailSent(contactEtiquetteId: number): Promise<void> {
  return invoke<void>("mark_etiquette_email_sent", { contactEtiquetteId });
}

// ==================== UTILITAIRES ====================

/**
 * Parse la configuration JSON d'une condition automatique
 */
export function parseConditionConfig<T>(config: string | null): T | null {
  if (!config) return null;
  try {
    return JSON.parse(config) as T;
  } catch {
    return null;
  }
}

/**
 * Stringify la configuration d'une condition automatique
 */
export function stringifyConditionConfig(config: object): string {
  return JSON.stringify(config);
}

/**
 * Parse les catégories JSON
 */
export function parseCategories(categories: string | null): string[] {
  if (!categories) return [];
  try {
    return JSON.parse(categories) as string[];
  } catch {
    return [];
  }
}

/**
 * Stringify les catégories
 */
export function stringifyCategories(categories: string[]): string {
  return JSON.stringify(categories);
}

/**
 * Calcule la couleur de texte optimale (blanc ou noir) selon la luminosité du fond
 */
export function getContrastColor(hexColor: string): string {
  // Enlever le # si présent
  const hex = hexColor.replace("#", "");
  
  // Convertir en RGB
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  
  // Calculer la luminosité relative (formule WCAG)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  
  // Retourner blanc ou noir selon la luminosité
  return luminance > 0.5 ? "#000000" : "#FFFFFF";
}

/**
 * Formate une date timestamp en format lisible
 */
export function formatDate(timestamp: number | null): string {
  if (!timestamp) return "";
  const date = new Date(timestamp * 1000);
  return date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
}

/**
 * Labels lisibles pour les types de conditions
 */
export const CONDITION_LABELS: Record<ConditionType, string> = {
  DELAI_SANS_CONTACT: "Le client n'a pas été contacté depuis X jours",
  DATE_APPROCHE: "La date de [champ] est dans moins de X jours",
  PERIODE_ANNEE: "Nous sommes entre [mois] et [mois]",
  TYPE_PRODUIT: "Le client détient un produit de type...",
  DATE_APPROCHE_INVESTISSEMENT: "Une date sur un investissement (contact ou foyer) approche",
  AGE_APPROCHE: "Le client approche d'un âge cible",
};

/**
 * Labels pour les champs de date
 */
export const CHAMPS_DATE_LABELS: Record<string, string> = {
  date_prochain_suivi: "Prochain suivi client",
  date_prochain_suivi_filleul: "Prochain suivi filleul",
  date_dernier_contact_filleul: "Dernier contact filleul",
  date_naissance: "Date de naissance",
};

/**
 * Liste des mois pour la sélection
 */
export const MOIS_LABELS = [
  { value: 1, label: "Janvier" },
  { value: 2, label: "Février" },
  { value: 3, label: "Mars" },
  { value: 4, label: "Avril" },
  { value: 5, label: "Mai" },
  { value: 6, label: "Juin" },
  { value: 7, label: "Juillet" },
  { value: 8, label: "Août" },
  { value: 9, label: "Septembre" },
  { value: 10, label: "Octobre" },
  { value: 11, label: "Novembre" },
  { value: 12, label: "Décembre" }
];
