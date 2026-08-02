import { getInvestissementsByContact, type Investissement } from "@/lib/api/tauri-investissements";
import { filterFicheConseilEligibleInvestissements } from "@/lib/pdf/arbitrage-fiche-conseil/fiche-conseil-resolve";
import { buildPartenaireNomMap } from "@/lib/pdf/arbitrage-fiche-conseil/fiche-conseil-partenaires";
import { resolveStelliumProductLabelFromCrmInvestissement } from "@/lib/pdf/arbitrage-fiche-conseil/fiche-conseil-stellium";

/** Contrats CRM dont le mapping Stellium correspond au libellé catalogue choisi. */
export function findInvestissementsMatchingStelliumProduct(
  investissements: Investissement[],
  partenaireNomsById: ReadonlyMap<number, string>,
  stelliumProductLabel: string
): Investissement[] {
  const target = stelliumProductLabel.trim();
  if (!target) return [];
  return filterFicheConseilEligibleInvestissements(investissements).filter((inv) => {
    const partenaireNom = inv.partenaire_id
      ? partenaireNomsById.get(inv.partenaire_id)
      : undefined;
    return (
      resolveStelliumProductLabelFromCrmInvestissement({
        type_produit: inv.type_produit,
        nom_produit: inv.nom_produit,
        partenaireNom,
      }) === target
    );
  });
}

/** Retourne l'id contrat si un seul match ; sinon null (ambigu ou aucun). */
export function resolveUnambiguousInvestissementIdForStelliumProduct(
  investissements: Investissement[],
  partenaireNomsById: ReadonlyMap<number, string>,
  stelliumProductLabel: string
): number | null {
  const matches = findInvestissementsMatchingStelliumProduct(
    investissements,
    partenaireNomsById,
    stelliumProductLabel
  );
  return matches.length === 1 ? matches[0].id : null;
}

/** Résout le contrat CRM lié à un acte Stellium AV/PER (pipe manuel, brouillon). */
export async function resolveInvestissementIdForStelliumAct(
  contactId: number,
  stelliumProductLabel: string
): Promise<number | null> {
  const product = stelliumProductLabel.trim();
  if (!product || contactId <= 0) return null;
  const investissements = await getInvestissementsByContact(contactId);
  const partenaireNoms = await buildPartenaireNomMap(investissements);
  return resolveUnambiguousInvestissementIdForStelliumProduct(
    investissements,
    partenaireNoms,
    product
  );
}
