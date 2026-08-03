/** Libellés UI — tels qu’affichés sur le modèle PDF arbitrage AV. */
export const FICHE_CONSEIL_ARBITRAGE_REDACTION_LABELS = {
  motif: "Justifier le motif de l'opération",
  supportsDesinvestis: "Supports désinvestis",
  supportsInvestis: "Supports investis",
} as const;

export type FicheConseilArbitrageRedactionInput = {
  motif: string;
  supportsDesinvestis: string;
  supportsInvestis: string;
};

export const EMPTY_FICHE_CONSEIL_ARBITRAGE_REDACTION: FicheConseilArbitrageRedactionInput = {
  motif: "",
  supportsDesinvestis: "",
  supportsInvestis: "",
};
