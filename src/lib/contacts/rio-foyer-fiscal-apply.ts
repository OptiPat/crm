import { getFoyerById, updateFoyer } from "@/lib/api/tauri-foyers";
import type { ExtractedData } from "@/lib/pdf";

/** Met à jour le foyer avec la fiscalité extraite du RIO (champs vides seulement). */
export async function applyRioFiscaliteToFoyer(
  foyerId: number,
  data: ExtractedData
): Promise<void> {
  if (!data.trancheImposition && data.nombrePartsFiscales == null && data.revenuBrutGlobal == null) {
    return;
  }

  const existing = await getFoyerById(foyerId);
  const patch = {
    nom: existing.nom,
    type_foyer: existing.type_foyer,
    tranche_imposition: existing.tranche_imposition || data.trancheImposition,
    nombre_parts_fiscales:
      existing.nombre_parts_fiscales ?? data.nombrePartsFiscales ?? undefined,
    revenu_fiscal_reference:
      existing.revenu_fiscal_reference ?? data.revenuBrutGlobal ?? undefined,
    situation_patrimoniale: existing.situation_patrimoniale,
    objectifs_patrimoniaux: existing.objectifs_patrimoniaux,
    notes: existing.notes,
  };

  const changed =
    patch.tranche_imposition !== existing.tranche_imposition ||
    patch.nombre_parts_fiscales !== existing.nombre_parts_fiscales ||
    patch.revenu_fiscal_reference !== existing.revenu_fiscal_reference;

  if (!changed) return;
  await updateFoyer(foyerId, patch);
}
