import { invoke } from "@tauri-apps/api/core";

export interface PersonalNote {
  id: number;
  title: string;
  content_html: string;
  category: string | null;
  pinned: boolean;
  created_at: number;
  updated_at: number;
}

export interface NewPersonalNote {
  title: string;
  content_html: string;
  category?: string | null;
  pinned?: boolean;
}

export interface UpdatePersonalNote {
  title: string;
  content_html: string;
  category?: string | null;
  pinned?: boolean;
}

export interface SharedNoteContribution {
  id: string;
  note_id: string;
  author_installation_id: string;
  author_name: string;
  content_html: string;
  created_at: number;
}

export interface SharedNote {
  id: string;
  title: string;
  content_html: string;
  author_installation_id: string;
  author_name: string;
  created_at: number;
  updated_at: number;
  contributions: SharedNoteContribution[];
  can_edit: boolean;
  can_delete: boolean;
}

export interface SharedNotesSyncResult {
  synced: boolean;
  notes: SharedNote[];
  message?: string | null;
}

export async function getAllPersonalNotes(): Promise<PersonalNote[]> {
  return await invoke<PersonalNote[]>("get_all_personal_notes_cmd");
}

export async function createPersonalNote(input: NewPersonalNote): Promise<PersonalNote> {
  return await invoke<PersonalNote>("create_personal_note_cmd", { input });
}

export async function updatePersonalNote(
  id: number,
  input: UpdatePersonalNote
): Promise<PersonalNote> {
  return await invoke<PersonalNote>("update_personal_note_cmd", { id, input });
}

export async function deletePersonalNote(id: number): Promise<void> {
  return await invoke<void>("delete_personal_note_cmd", { id });
}

export async function getSharedNotes(): Promise<SharedNote[]> {
  return await invoke<SharedNote[]>("get_shared_notes_cmd");
}

export async function syncSharedNotes(): Promise<SharedNotesSyncResult> {
  return await invoke<SharedNotesSyncResult>("sync_shared_notes_cmd");
}

export async function createSharedNote(input: {
  title: string;
  contentHtml: string;
}): Promise<SharedNote[]> {
  return await invoke<SharedNote[]>("create_shared_note_cmd", {
    input: { title: input.title, content_html: input.contentHtml },
  });
}

export async function updateSharedNote(
  noteId: string,
  input: { title: string; contentHtml: string }
): Promise<SharedNote[]> {
  return await invoke<SharedNote[]>("update_shared_note_cmd", {
    noteId,
    input: { title: input.title, content_html: input.contentHtml },
  });
}

export async function deleteSharedNote(noteId: string): Promise<SharedNote[]> {
  return await invoke<SharedNote[]>("delete_shared_note_cmd", { noteId });
}

export async function addSharedNoteContribution(input: {
  noteId: string;
  contentHtml: string;
}): Promise<SharedNote[]> {
  return await invoke<SharedNote[]>("add_shared_note_contribution_cmd", {
    input: { note_id: input.noteId, content_html: input.contentHtml },
  });
}
