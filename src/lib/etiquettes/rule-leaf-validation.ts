import type { RuleLeaf } from "@/lib/etiquettes/rule-ast";
import { isTypeProduitConditionValid } from "@/lib/etiquettes/type-produit-condition";

/** Même contraintes que validateEtiquetteForm pour l’aperçu combo / segment. */
export function isRuleLeafValidForPreview(leaf: RuleLeaf): boolean {
  if (leaf.categories.length === 0) return false;

  switch (leaf.type) {
    case "TYPE_PRODUIT": {
      const types = (leaf.config.types as string[] | undefined) ?? [];
      const noms = (leaf.config.noms_produit as string[] | undefined) ?? [];
      return isTypeProduitConditionValid(types, noms);
    }
    case "TMI": {
      const tranches = (leaf.config.tranches as unknown[] | undefined) ?? [];
      return tranches.length > 0;
    }
    case "IR_NET": {
      const montant = leaf.config.montant;
      return montant != null && montant !== "" && Number.isFinite(Number(montant));
    }
    default:
      return true;
  }
}

export function findFirstInvalidRuleLeafIndex(leaves: RuleLeaf[]): number | null {
  const idx = leaves.findIndex((leaf) => !isRuleLeafValidForPreview(leaf));
  return idx >= 0 ? idx : null;
}
