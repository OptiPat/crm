/**
 * Catalogue des avoirs que le client peut déclarer — pas la liste CRM complète.
 * Premier étage = panier (comme l'inventaire), second = type précis.
 *
 * « Autre » immobilier / épargne retombe sur le type fourre-tout du panier
 * pour rester dans le bon camembert. « Autre » placements = AUTRE.
 */

export type AvoirPanier = "immobilier" | "scpi" | "placements" | "epargne";

export interface AvoirTypeOption {
  typeProduit: string;
  label: string;
  /** Distinct quand deux libellés retombent sur le même type CRM. */
  valeurOption?: string;
}

export const AVOIR_PANIERS: Array<{ id: AvoirPanier; label: string }> = [
  { id: "immobilier", label: "Immobilier" },
  { id: "scpi", label: "SCPI" },
  { id: "placements", label: "Placements financiers" },
  { id: "epargne", label: "Épargne / Banque" },
];

export const AVOIR_TYPES_PAR_PANIER: Record<AvoirPanier, AvoirTypeOption[]> = {
  immobilier: [
    { typeProduit: "RESIDENCE_PRINCIPALE", label: "Résidence Principale" },
    { typeProduit: "RESIDENCE_SECONDAIRE", label: "Résidence Secondaire" },
    { typeProduit: "LMNP", label: "LMNP" },
    { typeProduit: "LOCATIF_CLASSIQUE", label: "Locatif classique (nue)" },
    { typeProduit: "PINEL", label: "Pinel" },
    { typeProduit: "DENORMANDIE", label: "Denormandie" },
    { typeProduit: "IMMOBILIER", label: "Autre" },
  ],
  scpi: [
    { typeProduit: "SCPI", label: "SCPI" },
    { typeProduit: "SCPI_DEMEMBREMENT", label: "SCPI Démembrement" },
  ],
  placements: [
    { typeProduit: "PEA", label: "PEA" },
    { typeProduit: "COMPTE_TITRE", label: "Compte-titres" },
    { typeProduit: "ASSURANCE_VIE", label: "Assurance vie" },
    { typeProduit: "CONTRAT_CAPITALISATION", label: "Contrat de Capitalisation" },
    { typeProduit: "PER", label: "PER" },
    { typeProduit: "EPARGNE_SALARIALE", label: "Épargne Salariale" },
    { typeProduit: "AUTRE", label: "Autre" },
  ],
  epargne: [
    { typeProduit: "COMPTE_COURANT", label: "Compte Courant" },
    { typeProduit: "LDDS", label: "LDD / LDDS" },
    { typeProduit: "LIVRET_A", label: "Livret A" },
    { typeProduit: "LEP", label: "LEP" },
    { typeProduit: "PEAC", label: "PEAC" },
    { typeProduit: "CEL", label: "CEL" },
    { typeProduit: "PEL", label: "PEL" },
    { typeProduit: "CAT", label: "Compte à Terme" },
    { typeProduit: "CSL", label: "Compte sur Livret" },
    { typeProduit: "EPARGNE_BANCAIRE", label: "Épargne bancaire" },
    {
      typeProduit: "EPARGNE_BANCAIRE",
      label: "Autre",
      valeurOption: "EPARGNE_BANCAIRE_AUTRE",
    },
  ],
};

/** Types uniques, toutes options confondues — filet d'alignement avec Rust. */
export const AVOIR_TYPES_UNIQUES: string[] = [
  ...new Set(
    Object.values(AVOIR_TYPES_PAR_PANIER).flatMap((opts) =>
      opts.map((o) => o.typeProduit)
    )
  ),
].sort();

export function isAvoirPanier(value: string): value is AvoirPanier {
  return AVOIR_PANIERS.some((p) => p.id === value);
}

export function isTypeAutorisePourPanier(
  panier: AvoirPanier,
  typeProduit: string
): boolean {
  return AVOIR_TYPES_PAR_PANIER[panier].some((o) => o.typeProduit === typeProduit);
}

export function panierEstImmobilier(panier: AvoirPanier): boolean {
  return panier === "immobilier";
}

export function panierEstScpi(panier: AvoirPanier): boolean {
  return panier === "scpi";
}

export function normaliserNomProduit(nom: string): string {
  return nom.trim().replace(/\s+/g, " ").toLowerCase();
}
