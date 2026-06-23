import type { ConditionTypeProduit } from "@/lib/api/tauri-etiquettes";

export function buildTypeProduitConditionConfig(
  types: string[],
  nomsProduit: string[]
): Record<string, unknown> {
  return {
    types,
    noms_produit: nomsProduit.length > 0 ? nomsProduit : undefined,
  };
}

export function parseTypeProduitConditionConfig(
  config: ConditionTypeProduit | null | undefined
): { types: string[]; nomsProduit: string[] } {
  return {
    types: config?.types ?? [],
    nomsProduit: config?.noms_produit ?? [],
  };
}

export function isTypeProduitConditionValid(types: string[], nomsProduit: string[]): boolean {
  return types.length > 0 || nomsProduit.length > 0;
}
