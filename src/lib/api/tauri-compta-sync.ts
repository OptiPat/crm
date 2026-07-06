import { invoke } from "@tauri-apps/api/core";

export interface ComptaDriveFileStatus {
  id: string;
  name: string;
  webViewLink?: string | null;
  mimeType: string;
  modifiedTime?: string | null;
  alreadyImported: boolean;
}

export interface ComptaDriveScanResponse {
  depensesFolderId?: string | null;
  encaissementsFolderId?: string | null;
  depensesFolderName: string;
  encaissementsFolderName: string;
  depensesFiles: ComptaDriveFileStatus[];
  encaissementsFiles: ComptaDriveFileStatus[];
}

export interface ComptaCalendarTripProposal {
  eventId: string;
  date: string;
  summary: string;
  location: string;
  alreadyImported: boolean;
}

export interface ImportComptaDriveDepenseInput {
  fileId: string;
  fileName: string;
  webViewLink: string;
  date: string;
  categorie: string;
  tiers: string;
  ttc: number;
  tva: number;
  ht: number;
}

export interface ImportComptaCalendarTripInput {
  eventId: string;
  date: string;
  destination: string;
  objet: string;
  km: number;
  indemnite: number;
}

export async function scanComptaDriveMonth(
  year: number,
  month: number
): Promise<ComptaDriveScanResponse> {
  return invoke<ComptaDriveScanResponse>("scan_compta_drive_month", { year, month });
}

export async function downloadComptaDriveFile(
  fileId: string,
  fileName: string
): Promise<string> {
  return invoke<string>("download_compta_drive_file", { fileId, fileName });
}

export async function scanComptaCalendarMonth(
  year: number,
  month: number
): Promise<ComptaCalendarTripProposal[]> {
  return invoke<ComptaCalendarTripProposal[]>("scan_compta_calendar_month", { year, month });
}

export async function importComptaDriveDepense(
  input: ImportComptaDriveDepenseInput
): Promise<unknown> {
  return invoke("import_compta_drive_depense", { input });
}

export async function importComptaCalendarTrip(
  input: ImportComptaCalendarTripInput
): Promise<unknown> {
  return invoke("import_compta_calendar_trip", { input });
}
