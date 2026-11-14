import type { Investissement } from "@/lib/api/tauri-investissements";
import { findInvestissementsMatchingStelliumProduct } from "@/lib/placement/resolve-investissement-for-stellium-act";
import {
  isVpMiseEnPlaceStelliumAct,
  isVpModificationStelliumAct,
} from "@/lib/pdf/arbitrage-fiche-conseil/fiche-conseil-stellium";
import type { VpModificationActValue } from "@/lib/pdf/arbitrage-fiche-conseil/vp-modification-types";
import type { VpMiseEnPlaceActValue } from "@/lib/pdf/arbitrage-fiche-conseil/vp-mise-en-place-types";
import { isVersementComplementaireActLabel } from "@/lib/pipe/pipe-suivi";

/** Types de contrat qui reçoivent versements / VP / arbitrages (cf. Rust `assert_versement_complementaire_eligible`). */
export const CONTRACT_LINK_TYPES = ["ASSURANCE_VIE", "PER", "CONTRAT_CAPITALISATION"] as const;

/** Seul arbitrage qui fait avancer « dernier / prochain arbitrage » du contrat. */
export const ARBITRAGE_LIBRE_LABEL = "Arbitrage libre";

function isVpStelliumActLabel(label: string): boolean {
  return label.trim().startsWith("Versements programmés");
}

/**
 * Acte reporté sur la fiche placement à la validation partenaire (même règle que Rust
 * `conforme_contract_effect`) : le contrat concerné doit être connu.
 */
export function stelliumActUpdatesContract(label: string): boolean {
  const trimmed = label.trim();
  return (
    isVersementComplementaireActLabel(trimmed) ||
    isVpStelliumActLabel(trimmed) ||
    trimmed === ARBITRAGE_LIBRE_LABEL
  );
}

/** Contrats actifs pouvant être liés à un acte de gestion. */
export function contractLinkCandidates(investissements: Investissement[]): Investissement[] {
  return investissements.filter(
    (inv) =>
      (inv.statut ?? "ACTIF") === "ACTIF" &&
      (CONTRACT_LINK_TYPES as readonly string[]).includes(inv.type_produit)
  );
}

/** Contrat proposé par défaut : correspondance unique avec le produit, sinon contrat unique. */
export function defaultContractLinkId(
  candidates: Investissement[],
  partenaireNomsById: ReadonlyMap<number, string>,
  productLabel: string
): number | null {
  if (productLabel.trim()) {
    const matches = findInvestissementsMatchingStelliumProduct(
      candidates,
      partenaireNomsById,
      productLabel
    ).filter((inv) => candidates.some((c) => c.id === inv.id));
    if (matches.length === 1) return matches[0].id;
    if (matches.length > 1) return null;
  }
  return candidates.length === 1 ? candidates[0].id : null;
}

/** Fréquence VP à reporter sur le contrat (mise en place, ou modification de périodicité). */
export function vpFrequenceFromStelliumAct(
  label: string,
  vpModification: VpModificationActValue | undefined,
  vpMiseEnPlace: VpMiseEnPlaceActValue | undefined
): string | null {
  if (isVpMiseEnPlaceStelliumAct(label)) return vpMiseEnPlace?.frequence || null;
  if (isVpModificationStelliumAct(label) && vpModification?.kinds.includes("periodicite")) {
    return vpModification.frequence || null;
  }
  return null;
}
