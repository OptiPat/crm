import { invoke } from "@tauri-apps/api/core";
import type { ArbitrageFicheProductKind } from "@/lib/api/tauri-arbitrage-fiche";

export interface FicheConseilRedactionPreset {
  id: number;
  nom: string;
  product_kind: ArbitrageFicheProductKind;
  motif: string;
  supports_desinvestis: string;
  supports_investis: string;
  allocation_operation: string;
  created_at: number;
  updated_at: number;
}

export interface NewFicheConseilRedactionPreset {
  nom: string;
  product_kind: ArbitrageFicheProductKind;
  motif: string;
  supports_desinvestis: string;
  supports_investis: string;
  allocation_operation: string;
}

export interface UpdateFicheConseilRedactionPreset {
  nom: string;
  product_kind: ArbitrageFicheProductKind;
  motif: string;
  supports_desinvestis: string;
  supports_investis: string;
  allocation_operation: string;
}

export async function getAllFicheConseilRedactionPresets(): Promise<FicheConseilRedactionPreset[]> {
  return await invoke<FicheConseilRedactionPreset[]>("get_all_fiche_conseil_redaction_presets");
}

export async function createFicheConseilRedactionPreset(
  input: NewFicheConseilRedactionPreset
): Promise<FicheConseilRedactionPreset> {
  return await invoke<FicheConseilRedactionPreset>("create_fiche_conseil_redaction_preset", {
    input,
  });
}

export async function updateFicheConseilRedactionPreset(
  id: number,
  input: UpdateFicheConseilRedactionPreset
): Promise<FicheConseilRedactionPreset> {
  return await invoke<FicheConseilRedactionPreset>("update_fiche_conseil_redaction_preset", {
    id,
    input,
  });
}

export async function deleteFicheConseilRedactionPreset(id: number): Promise<void> {
  await invoke<void>("delete_fiche_conseil_redaction_preset", { id });
}
