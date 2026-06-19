import { getFoyerById, updateFoyer } from "@/lib/api/tauri-foyers";
import type { ExtractedData } from "@/lib/pdf";

/** Met à jour le foyer avec la fiscalité extraite du RIO (le RIO fait foi au ré-import). */
export async function applyRioFiscaliteToFoyer(
  foyerId: number,
  data: ExtractedData
): Promise<void> {
  if (
    !data.trancheImposition &&
    data.nombrePartsFiscales == null &&
    data.revenuBrutGlobal == null &&
    data.irNetAPayer == null
  ) {
    return;
  }

  const existing = await getFoyerById(foyerId);
  // Ré-import : le RIO fait foi (met à jour la fiscalité), on garde l'ancienne
  // valeur uniquement si le RIO ne fournit rien pour ce champ.
  const patch = {
    nom: existing.nom,
    type_foyer: existing.type_foyer,
    tranche_imposition: data.trancheImposition || existing.tranche_imposition,
    nombre_parts_fiscales:
      data.nombrePartsFiscales ?? existing.nombre_parts_fiscales ?? undefined,
    revenu_fiscal_reference:
      data.revenuBrutGlobal ?? existing.revenu_fiscal_reference ?? undefined,
    ir_net_a_payer: data.irNetAPayer ?? existing.ir_net_a_payer ?? undefined,
    situation_patrimoniale: existing.situation_patrimoniale,
    objectifs_patrimoniaux: existing.objectifs_patrimoniaux,
    notes: existing.notes,
  };

  const changed =
    patch.tranche_imposition !== existing.tranche_imposition ||
    patch.nombre_parts_fiscales !== existing.nombre_parts_fiscales ||
    patch.revenu_fiscal_reference !== existing.revenu_fiscal_reference ||
    patch.ir_net_a_payer !== existing.ir_net_a_payer;

  if (!changed) return;
  await updateFoyer(foyerId, patch);
}
