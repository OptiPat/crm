import { invoke } from "@tauri-apps/api/core";

export interface ClientOneDriveStatus {
  connected: boolean;
  email: string | null;
  rootFolderId: string | null;
  rootFolderName: string | null;
  localSyncRoot: string | null;
  microsoftClientIdConfigured: boolean;
}

export interface OpenClientOneDriveFolderResult {
  mode: "local" | "web" | string;
  message: string | null;
}

export interface ClientOneDriveItem {
  id: string;
  name: string;
  webUrl: string | null;
  isFolder: boolean;
  lastModified: string | null;
}

export interface ClientOneDriveBrowseResult {
  folderId: string;
  folderName: string;
  parentFolderId: string | null;
  items: ClientOneDriveItem[];
}

export interface ClientOneDriveFolderLink {
  folderId: string;
  folderName: string;
  webUrl: string | null;
  source: "contact" | "foyer" | string;
}

export interface ClientOneDriveFolderProposal {
  folderId: string;
  folderName: string;
  webUrl: string | null;
  contactId: number | null;
  foyerId: number | null;
  label: string;
  confidence: string;
  source: string;
  matchKind: string;
  suggestedFolderName: string | null;
}

export async function getClientOneDriveStatus(): Promise<ClientOneDriveStatus> {
  return invoke<ClientOneDriveStatus>("get_client_onedrive_status");
}

export async function connectMicrosoftOneDriveOAuth(options?: {
  forceConsent?: boolean;
}): Promise<ClientOneDriveStatus> {
  return invoke<ClientOneDriveStatus>("connect_microsoft_onedrive_oauth_cmd", {
    forceConsent: options?.forceConsent ?? null,
  });
}

export async function disconnectMicrosoftOneDriveOAuth(): Promise<void> {
  return invoke<void>("disconnect_microsoft_onedrive_oauth_cmd");
}

export async function saveClientOneDriveRootFolder(
  folderId: string,
  folderName: string
): Promise<void> {
  await invoke("save_client_onedrive_root_folder", { folderId, folderName });
}

export async function saveClientOneDriveLocalSyncRoot(path: string): Promise<void> {
  await invoke("save_client_onedrive_local_sync_root", { path });
}

export async function openClientOneDriveFolder(
  folderId: string,
  options?: { folderName?: string | null }
): Promise<OpenClientOneDriveFolderResult> {
  return invoke<OpenClientOneDriveFolderResult>("open_client_onedrive_folder", {
    folderId,
    folderName: options?.folderName ?? null,
  });
}

export interface ContactOneDriveHealth {
  status:
    | "not_connected"
    | "not_linked"
    | "not_configured"
    | "ok"
    | "cloud_missing"
    | "out_of_root"
    | string;
  folderId: string | null;
  folderName: string | null;
  localAvailable: boolean;
}

export interface ContactOneDriveLinkFlag {
  contactId: number;
  linked: boolean;
}

export async function unlinkContactOneDriveFolder(contactId: number): Promise<void> {
  await invoke("unlink_contact_onedrive_folder", { contactId });
}

export async function getContactOneDriveHealth(
  contactId: number
): Promise<ContactOneDriveHealth> {
  return invoke<ContactOneDriveHealth>("get_contact_onedrive_health", { contactId });
}

export async function listContactsOneDriveLinkFlags(): Promise<ContactOneDriveLinkFlag[]> {
  return invoke<ContactOneDriveLinkFlag[]>("list_contacts_onedrive_link_flags");
}

export async function browseClientOneDrive(
  folderId?: string | null
): Promise<ClientOneDriveBrowseResult> {
  return invoke<ClientOneDriveBrowseResult>("browse_client_onedrive", {
    folderId: folderId ?? null,
  });
}

export async function resolveContactOneDriveFolder(
  contactId: number
): Promise<ClientOneDriveFolderLink | null> {
  return invoke<ClientOneDriveFolderLink | null>("resolve_contact_onedrive_folder", {
    contactId,
  });
}

export async function linkContactOneDriveFolder(input: {
  contactId: number;
  folderId: string;
  folderName: string;
  webUrl?: string | null;
}): Promise<void> {
  await invoke("link_contact_onedrive_folder", {
    contactId: input.contactId,
    folderId: input.folderId,
    folderName: input.folderName,
    webUrl: input.webUrl ?? null,
  });
}

export async function createContactOneDriveFolder(
  contactId: number
): Promise<ClientOneDriveFolderLink> {
  return invoke<ClientOneDriveFolderLink>("create_contact_onedrive_folder_cmd", {
    contactId,
  });
}

export async function proposeClientOneDriveFolderMatches(): Promise<
  ClientOneDriveFolderProposal[]
> {
  return invoke<ClientOneDriveFolderProposal[]>("propose_client_onedrive_folder_matches");
}

export async function applyClientOneDriveFolderProposal(
  proposal: ClientOneDriveFolderProposal,
  options?: { renameTo?: string | null }
): Promise<void> {
  await invoke("apply_client_onedrive_folder_proposal", {
    proposal,
    renameTo: options?.renameTo ?? null,
  });
}
