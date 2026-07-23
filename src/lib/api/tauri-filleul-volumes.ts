import { invoke } from "@tauri-apps/api/core";
import { notifyContactsChanged } from "@/lib/contacts/contact-events";

export interface FilleulVolumeExercice {
  contactId: number;
  exerciceLabel: string;
  volumePropre: number | null;
  volumeBranche: number | null;
  volumeManager: number | null;
  closedAt: number | null;
  source: string;
}

export interface FilleulVolumeExerciceEntry {
  contactId: number;
  volumePropre: number | null;
  volumeBranche: number | null;
  volumeManager: number | null;
}

export interface CloseFilleulExerciceInput {
  exerciceLabel: string;
  entries: FilleulVolumeExerciceEntry[];
  resetOwnVolumes: boolean;
}

export async function listFilleulVolumeExerciceLabels(): Promise<string[]> {
  return invoke<string[]>("list_filleul_volume_exercice_labels");
}

export async function getFilleulVolumeExercicesByLabel(
  exerciceLabel: string
): Promise<FilleulVolumeExercice[]> {
  return invoke<FilleulVolumeExercice[]>("get_filleul_volume_exercices_by_label", {
    exerciceLabel,
  });
}

export async function exerciceIsClosed(exerciceLabel: string): Promise<boolean> {
  return invoke<boolean>("exercice_is_closed", { exerciceLabel });
}

export async function closeFilleulExercice(
  input: CloseFilleulExerciceInput
): Promise<void> {
  await invoke<void>("close_filleul_exercice", { input });
  notifyContactsChanged();
}

export interface FilleulVolumeExerciceImportEntry {
  contactId: number;
  exerciceLabel: string;
  volumePropre: number;
}

export interface ImportFilleulVolumeExercicesInput {
  entries: FilleulVolumeExerciceImportEntry[];
  syncCurrentContactVolumes: boolean;
  currentExerciceLabel?: string | null;
}

export async function importFilleulVolumeExercices(
  input: ImportFilleulVolumeExercicesInput
): Promise<number> {
  const applied = await invoke<number>("import_filleul_volume_exercices", { input });
  notifyContactsChanged();
  return applied;
}
