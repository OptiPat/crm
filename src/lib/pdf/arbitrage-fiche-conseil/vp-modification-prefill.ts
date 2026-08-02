import type { Investissement } from "@/lib/api/tauri-investissements";
import { getInvestissementsByContact } from "@/lib/api/tauri-investissements";
import { buildPartenaireNomMap } from "@/lib/pdf/arbitrage-fiche-conseil/fiche-conseil-partenaires";
import { hasActiveVersementProgramme } from "@/lib/investissements/investissement-versements";
import { formatMontantCentimesInput } from "@/lib/pipe/placement-montant";
import {
  resolveUnambiguousInvestissementIdForStelliumProduct,
} from "@/lib/placement/resolve-investissement-for-stellium-act";

/** Suggestion UI — montant VP actuel du contrat CRM. */
export function resolveVpModificationMontantEurosPrefill(
  investissement?: Pick<
    Investissement,
    "versement_programme" | "montant_versement_programme"
  > | null
): string {
  if (!investissement || !hasActiveVersementProgramme(investissement)) return "";
  const centimes = investissement.montant_versement_programme;
  if (centimes == null || centimes <= 0) return "";
  return formatMontantCentimesInput(centimes);
}

/** Suggestion du montant VP depuis le contrat lié au produit Stellium. */
export async function loadVpModificationMontantEurosPrefill(
  contactId: number,
  stelliumProductLabel: string
): Promise<string> {
  const product = stelliumProductLabel.trim();
  if (!contactId || !product) return "";

  const investissements = await getInvestissementsByContact(contactId);
  const partenaireNoms = await buildPartenaireNomMap(investissements);
  const investissementId = resolveUnambiguousInvestissementIdForStelliumProduct(
    investissements,
    partenaireNoms,
    product
  );
  if (!investissementId) return "";

  const investissement = investissements.find((inv) => inv.id === investissementId);
  return resolveVpModificationMontantEurosPrefill(investissement);
}
