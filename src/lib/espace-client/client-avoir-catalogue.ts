/**
 * Catalogue des avoirs que le client peut déclarer — pas la liste CRM complète.
 * Premier étage = panier (comme l'inventaire), second = type précis.
 *
 * « Autre » immobilier / épargne retombe sur le type fourre-tout du panier
 * pour rester dans le bon camembert. « Autre » placements = AUTRE.
 */

export type AvoirPanier =
  | "immobilier"
  | "scpi"
  | "placements"
  | "epargne"
  | "meubles";

export interface AvoirTypeOption {
  typeProduit: string;
  label: string;
  /** Distinct quand deux libellés retombent sur le même type CRM. */
  valeurOption?: string;
  /** Nom CRM figé : pas de champ nom côté déclaration client. */
  nomImplicite?: string;
}

export const AVOIR_PANIERS: Array<{ id: AvoirPanier; label: string }> = [
  { id: "immobilier", label: "Immobilier" },
  { id: "scpi", label: "SCPI" },
  { id: "placements", label: "Placements financiers" },
  { id: "epargne", label: "Épargne / Banque" },
  { id: "meubles", label: "Biens meubles, professionnels" },
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
    {
      typeProduit: "EPARGNE_SALARIALE",
      label: "PEE",
      valeurOption: "EPARGNE_SALARIALE_PEE",
      nomImplicite: "PEE",
    },
    {
      typeProduit: "EPARGNE_SALARIALE",
      label: "PERCOL",
      valeurOption: "EPARGNE_SALARIALE_PERCOL",
      nomImplicite: "PERCOL",
    },
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
  meubles: [
    { typeProduit: "BIJOUX", label: "Bijoux" },
    { typeProduit: "OBJET_ART", label: "Objet d'art" },
    { typeProduit: "VOITURE_COLLECTION", label: "Voiture de collection" },
    { typeProduit: "PARTS_SOCIETE", label: "Parts de société" },
    { typeProduit: "FONDS_COMMERCE", label: "Fonds de commerce" },
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

export function optionAvoirParValeur(
  panier: AvoirPanier,
  valeur: string
): AvoirTypeOption | undefined {
  return AVOIR_TYPES_PAR_PANIER[panier].find(
    (o) => (o.valeurOption ?? o.typeProduit) === valeur
  );
}

export function panierEstImmobilier(panier: AvoirPanier): boolean {
  return panier === "immobilier";
}

export function panierEstScpi(panier: AvoirPanier): boolean {
  return panier === "scpi";
}

export function panierEstMeubles(panier: AvoirPanier): boolean {
  return panier === "meubles";
}

export function normaliserNomProduit(nom: string): string {
  return nom.trim().replace(/\s+/g, " ").toLowerCase();
}
