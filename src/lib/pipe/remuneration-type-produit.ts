import { inferTypeProduitFromImportProduitLabel } from "@/lib/investissements/infer-type-produit-from-import-label";
import { stelliumProductFamilyIdForProduct } from "@/lib/placement/stellium-box-placement-products";

const STELLIUM_FAMILY_TO_TYPE: Record<string, string> = {
  "assurance-vie": "ASSURANCE_VIE",
  per: "PER",
  capitalisation: "CONTRAT_CAPITALISATION",
  scpi: "SCPI",
};

/** Infère `type_produit` depuis le libellé produit Stellium (catalogue pipe). */
export function inferTypeProduitFromStelliumProductLabel(productLabel: string): string {
  const trimmed = productLabel.trim();
  if (!trimmed) return "AUTRE";
  const family = stelliumProductFamilyIdForProduct(trimmed);
  if (family && STELLIUM_FAMILY_TO_TYPE[family]) {
    return STELLIUM_FAMILY_TO_TYPE[family];
  }
  return inferTypeProduitFromImportProduitLabel(trimmed);
}
