import { invoke } from "@tauri-apps/api/core";
import { notifyContactsChanged } from "@/lib/contacts/contact-events";

export interface FilleulDossier {
  contactId: number;
  dateInvitation: number | null;
  dateInscription: number | null;
  dateDesinscription: number | null;
  datePremiereSouscriptionImo: number | null;
  datePremiereSouscriptionPlacement: number | null;
  datePremiereSouscriptionScpi: number | null;
  datePassageManager: number | null;
  dateHabilitationCif: number | null;
  datePremierVaaOuVa: number | null;
  notes: string | null;
  updatedAt: number;
}

export interface UpsertFilleulDossierInput {
  contactId: number;
  dateInvitation: number | null;
  dateInscription: number | null;
  dateDesinscription: number | null;
  datePremiereSouscriptionImo: number | null;
  datePremiereSouscriptionPlacement: number | null;
  datePremiereSouscriptionScpi: number | null;
  datePassageManager: number | null;
  dateHabilitationCif: number | null;
  datePremierVaaOuVa: number | null;
  notes: string | null;
}

export async function getFilleulDossier(contactId: number): Promise<FilleulDossier> {
  return invoke<FilleulDossier>("get_filleul_dossier", { contactId });
}

export async function getFilleulDossiersByContactIds(
  contactIds: number[]
): Promise<FilleulDossier[]> {
  if (contactIds.length === 0) return [];
  return invoke<FilleulDossier[]>("get_filleul_dossiers_by_contact_ids", { contactIds });
}

export async function upsertFilleulDossier(
  input: UpsertFilleulDossierInput,
  options?: { notifyContactsChanged?: boolean }
): Promise<FilleulDossier> {
  const saved = await invoke<FilleulDossier>("upsert_filleul_dossier", { input });
  if (options?.notifyContactsChanged) {
    notifyContactsChanged();
  }
  return saved;
}
