import type { ArbitrageFicheProductKind, FicheConseilTemplateFamily } from "@/lib/api/tauri-arbitrage-fiche";
import type { Investissement } from "@/lib/api/tauri-investissements";
import { placementOperationTypeFromStelliumLabel } from "@/lib/placement/stellium-box-placement-labels";
import {
  STELLIUM_BOX_PLACEMENT_PRODUCTS,
  stelliumBoxPlacementProductsMatch,
} from "@/lib/placement/stellium-box-placement-products";
import { inferTypeProduitFromStelliumProductLabel } from "@/lib/pipe/remuneration-type-produit";
import { resolveStelliumAvProductLabelFromCrm } from "@/lib/pdf/arbitrage-fiche-conseil/av-stellium-product-map";
import { resolveStelliumPerProductLabelFromCrm } from "@/lib/pdf/arbitrage-fiche-conseil/per-stellium-product-map";

/** Acte Stellium par défaut pour un arbitrage depuis une tâche fiche conseil. */
export const FICHE_CONSEIL_ARBITRAGE_ACT_LABEL = "Arbitrage libre";

/** Acte Stellium — modification des versements programmés (pipe acte de gestion). */
export const FICHE_CONSEIL_VP_MODIFICATION_ACT_LABEL =
  "Versements programmés : Modification";

export function isVpModificationStelliumAct(stelliumLabel: string): boolean {
  return stelliumLabel.trim() === FICHE_CONSEIL_VP_MODIFICATION_ACT_LABEL;
}

function isAvPerStelliumProduct(productLabel: string): boolean {
  const typeProduit = inferTypeProduitFromStelliumProductLabel(productLabel);
  return typeProduit === "ASSURANCE_VIE" || typeProduit === "PER";
}

export function isStelliumActEligibleForFicheConseil(
  stelliumLabel: string,
  productLabel: string
): boolean {
  const label = stelliumLabel.trim();
  const product = productLabel.trim();
  if (!label || !product) return false;
  if (!isAvPerStelliumProduct(product)) return false;
  if (isVpModificationStelliumAct(label)) return true;
  if (placementOperationTypeFromStelliumLabel(label) !== "ARBITRAGE") return false;
  return true;
}

export function resolveFicheConseilTemplateFamily(
  stelliumLabel: string
): FicheConseilTemplateFamily {
  return isVpModificationStelliumAct(stelliumLabel) ? "VP_MODIFICATION" : "ARBITRAGE";
}

export function stelliumProductLabelToFicheProductKind(
  productLabel: string
): ArbitrageFicheProductKind | null {
  const typeProduit = inferTypeProduitFromStelliumProductLabel(productLabel);
  if (typeProduit === "ASSURANCE_VIE") return "AV";
  if (typeProduit === "PER") return "PER";
  return null;
}

/** Associe un nom produit CRM au libellé catalogue Stellium si possible. */
export function resolveStelliumProductLabelFromNomProduit(nomProduit: string): string | null {
  const trimmed = nomProduit.trim();
  if (!trimmed) return null;
  return (
    STELLIUM_BOX_PLACEMENT_PRODUCTS.find((item) =>
      stelliumBoxPlacementProductsMatch(trimmed, item)
    ) ?? null
  );
}

/** Contrat CRM (nom + partenaire) → libellé produit Stellium. AV : mapping assureur ; sinon nom exact. */
export function resolveStelliumProductLabelFromCrmInvestissement(input: {
  type_produit: string;
  nom_produit?: string | null;
  partenaireNom?: string | null;
}): string | null {
  if (input.type_produit === "ASSURANCE_VIE") {
    return (
      resolveStelliumAvProductLabelFromCrm({
        nomProduit: input.nom_produit,
        partenaireNom: input.partenaireNom,
      }) ?? resolveStelliumProductLabelFromNomProduit(input.nom_produit ?? "")
    );
  }
  if (input.type_produit === "PER") {
    return (
      resolveStelliumPerProductLabelFromCrm({
        nomProduit: input.nom_produit,
        partenaireNom: input.partenaireNom,
      }) ?? resolveStelliumProductLabelFromNomProduit(input.nom_produit ?? "")
    );
  }
  return resolveStelliumProductLabelFromNomProduit(input.nom_produit ?? "");
}

export function resolveStelliumProductLabelFromInvestissement(
  inv: Pick<Investissement, "type_produit" | "nom_produit">,
  partenaireNom?: string | null
): string | null {
  return resolveStelliumProductLabelFromCrmInvestissement({
    type_produit: inv.type_produit,
    nom_produit: inv.nom_produit,
    partenaireNom,
  });
}
