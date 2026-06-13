import { invoke } from "@tauri-apps/api/core";

// Types
export interface Setting {
  key: string;
  value: string;
  updated_at: number;
}

export interface AgendaLink {
  id: string;
  label: string;
  url: string;
}

export interface CgpConfig {
  nom?: string;
  prenom?: string;
  cabinet?: string;
  email?: string;
  telephone?: string;
  agenda_links?: AgendaLink[];
  /** @deprecated Migré vers agenda_links */
  lien_agenda?: string;
  lien_calendly?: string;
  logo_path?: string;
  wizard_completed: boolean;
  wizard_step: number;
  /** Signature en fin d'email (texte brut). */
  email_signature?: string | null;
  /** Signature HTML (logo Gmail) — utilisée à l'envoi. */
  email_signature_html?: string | null;
  /** Jours sans retour avant proposition de relance (défaut 5). */
  email_suivi_delai_jours?: number | null;
  /** Site web du cabinet (footer newsletter, signature). */
  site_web?: string | null;
  adresse?: string | null;
  code_postal?: string | null;
  ville?: string | null;
  /** N° SIREN (affichage documents CIF). */
  cif_siren?: string | null;
  /** Ville du greffe RCS (ex. Montpellier). */
  cif_rcs_ville?: string | null;
  /** N° adhérent Anacofi CIF (ex. E011507). */
  cif_anacofi_numero?: string | null;
  /** N° ORIAS. */
  cif_orias?: string | null;
  /** Pied de page légal CIF personnalisé (remplace le modèle par défaut si renseigné). */
  cif_pied_de_page?: string | null;
}

// ========== SETTINGS GÉNÉRIQUES ==========

export async function getSetting(key: string): Promise<string | null> {
  return await invoke<string | null>("get_setting", { key });
}

export async function setSetting(key: string, value: string): Promise<void> {
  return await invoke<void>("set_setting", { key, value });
}

export async function deleteSetting(key: string): Promise<void> {
  return await invoke<void>("delete_setting", { key });
}

export async function getAllSettings(): Promise<Setting[]> {
  return await invoke<Setting[]>("get_all_settings");
}

// ========== CONFIGURATION CGP ==========

export async function getCgpConfig(): Promise<CgpConfig> {
  return await invoke<CgpConfig>("get_cgp_config");
}

export async function saveCgpConfig(config: CgpConfig): Promise<void> {
  return await invoke<void>("save_cgp_config", { config });
}

// ========== WIZARD ==========

export async function isWizardCompleted(): Promise<boolean> {
  return await invoke<boolean>("is_wizard_completed");
}

export async function completeWizard(): Promise<void> {
  return await invoke<void>("complete_wizard");
}

export async function updateWizardStep(step: number): Promise<void> {
  return await invoke<void>("update_wizard_step", { step });
}
