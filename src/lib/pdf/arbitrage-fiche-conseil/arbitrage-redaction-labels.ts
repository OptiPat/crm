import type { ArbitrageFicheProductKind } from "@/lib/api/tauri-arbitrage-fiche";

/** Libellés UI — tels qu’affichés sur les modèles PDF arbitrage. */
export const FICHE_CONSEIL_ARBITRAGE_REDACTION_LABELS = {
  motif: "Justifier le motif de l'opération",
  supportsDesinvestis: "Supports désinvestis",
  supportsInvestis: "Supports investis",
  allocationOperation:
    "L'allocation d'actifs et l'opération (type opération, montant ...) :",
} as const;

export type FicheConseilArbitrageRedactionInput = {
  motif: string;
  supportsDesinvestis: string;
  supportsInvestis: string;
  allocationOperation: string;
};

export const EMPTY_FICHE_CONSEIL_ARBITRAGE_REDACTION: FicheConseilArbitrageRedactionInput = {
  motif: "",
  supportsDesinvestis: "",
  supportsInvestis: "",
  allocationOperation: "",
};

export function isAvArbitrageRedaction(
  productKind: ArbitrageFicheProductKind
): productKind is "AV" {
  return productKind === "AV";
}

export function validateArbitrageRedactionInput(
  productKind: ArbitrageFicheProductKind,
  input: FicheConseilArbitrageRedactionInput
): string | null {
  if (isAvArbitrageRedaction(productKind)) {
    if (!input.motif.trim()) {
      return FICHE_CONSEIL_ARBITRAGE_REDACTION_LABELS.motif;
    }
    return null;
  }
  if (!input.allocationOperation.trim()) {
    return FICHE_CONSEIL_ARBITRAGE_REDACTION_LABELS.allocationOperation;
  }
  return null;
}
