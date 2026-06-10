/** Types immobilier (couleur dédiée). */
export const IMMOBILIER_TYPES = [
  "IMMOBILIER",
  "LMNP",
  "LMP",
  "PINEL",
  "MALRAUX",
  "DENORMANDIE",
  "JEANBRUN",
  "RP",
  "RS",
  "DEFICIT_FONCIER",
  "MONUMENT_HISTORIQUE",
  "LOCATIF",
  "LOCATIF_CLASSIQUE",
  "NUE_PROPRIETE",
  "RESIDENCE_PRINCIPALE",
  "COLOCATION",
  "MONOLOCATION",
  "SCI",
] as const;

const PRODUCT_TYPE_LABELS: Record<string, string> = {
  SCPI: "SCPI",
  SCPI_DEMEMBREMENT: "SCPI Démembrement",
  ASSURANCE_VIE: "Assurance Vie",
  PER: "PER",
  IMMOBILIER: "Immobilier",
  FIP_FCPI: "FIP/FCPI",
  FCPR: "FCPR / FPCI",
  G3F: "G3F",
  PINEL: "Pinel",
  JEANBRUN: "Jeanbrun",
  MALRAUX: "Malraux",
  DENORMANDIE: "Denormandie",
  MONUMENT_HISTORIQUE: "Monument Historique",
  DEFICIT_FONCIER: "Déficit Foncier",
  LMNP: "LMNP",
  LMP: "LMP",
  NUE_PROPRIETE: "Nue-Propriété",
  RESIDENCE_PRINCIPALE: "Résidence Principale",
  LOCATIF_CLASSIQUE: "Locatif Classique",
  SCPI_FISCALE: "SCPI Fiscale",
  CONTRAT_CAPITALISATION: "Contrat de Capitalisation",
  EPARGNE_SALARIALE: "Épargne Salariale",
  AUTRE: "Autre",
};

/** Noms courts / variantes import (ex. « Fip » en base → FIP). */
const PRODUCT_NAME_ALIASES: Record<string, string> = {
  fip: "FIP",
  fcpi: "FCPI",
  fcpr: "FCPR / FPCI",
  fpci: "FCPR / FPCI",
  scpi: "SCPI",
  per: "PER",
  g3f: "G3F",
  "fip/fcpi": "FIP/FCPI",
  "fip fcpi": "FIP/FCPI",
  "fip-fcpi": "FIP/FCPI",
};

const KNOWN_ACRONYMS = new Set(["FIP", "FCPI", "FCPR", "SCPI", "PER", "G3F"]);

/** Libellé commercial (ne pas réécrire : &, /, espaces, casse d'origine). */
function isCommercialProductLabel(value: string): boolean {
  return /[&/|+]/.test(value) || /\s/.test(value);
}

/** Code technique type ASSURANCE_VIE (underscores, sans caractères spéciaux). */
function isTechnicalProductCode(value: string): boolean {
  return value.includes("_") && !isCommercialProductLabel(value);
}

/**
 * Libellé lisible pour type_produit ou nom_produit.
 * Corrige uniquement les sigles isolés (Fip → FIP) ; ne transforme pas les noms de fonds.
 */
export function formatNomProduit(nom: string): string {
  const trimmed = nom?.trim() ?? "";
  if (!trimmed) return "";

  const typeKey = trimmed.toUpperCase().replace(/[- ]/g, "_");
  if (PRODUCT_TYPE_LABELS[typeKey]) {
    return PRODUCT_TYPE_LABELS[typeKey];
  }
  if (PRODUCT_TYPE_LABELS[trimmed]) {
    return PRODUCT_TYPE_LABELS[trimmed];
  }

  const alias = PRODUCT_NAME_ALIASES[trimmed.toLowerCase()];
  if (alias) return alias;

  if (/^[A-Za-z]{2,6}$/.test(trimmed)) {
    const upper = trimmed.toUpperCase();
    if (KNOWN_ACRONYMS.has(upper)) return upper;
  }

  if (isCommercialProductLabel(trimmed)) {
    return trimmed;
  }

  if (isTechnicalProductCode(trimmed)) {
    return trimmed
      .replace(/_/g, " ")
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  return trimmed;
}

/** Texte badge type produit (palette historique CRM). */
export function getTypeProduitTextClass(_type: string, origine?: string): string {
  if (origine === "EXISTANT_CLIENT") {
    return "text-gray-700";
  }
  return "text-white";
}

/** Fond badge type produit — vert immobilier, rose placements financiers. */
export function getTypeProduitBgColor(type: string, origine?: string): string {
  if (origine === "EXISTANT_CLIENT") {
    return "#9ca3af";
  }
  if (IMMOBILIER_TYPES.includes(type as (typeof IMMOBILIER_TYPES)[number])) {
    return "#85ad39";
  }
  return "#dc216e";
}

export type InvestissementMetaTone =
  | "default"
  | "amount"
  | "vp"
  | "tag"
  | "term"
  | "growth";

export function formatEuroCentimes(centimes?: number): string {
  if (centimes == null || centimes === 0) return "-";
  const hasFractionalCentimes = Math.abs(centimes % 100) !== 0;
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: hasFractionalCentimes ? 2 : 0,
    maximumFractionDigits: hasFractionalCentimes ? 2 : 0,
  }).format(centimes / 100);
}

export const INVESTISSEMENT_META_TONE_CLASS: Record<
  InvestissementMetaTone,
  string
> = {
  default: "text-muted-foreground [&>svg]:text-muted-foreground/75",
  amount: "font-medium tabular-nums text-foreground",
  vp: "inline-flex items-center gap-1.5 flex-nowrap whitespace-nowrap rounded-md border border-amber-200/80 bg-amber-50/90 px-2 py-0.5 text-amber-950 [&>svg]:text-amber-700",
  tag: "inline-flex items-center gap-1.5 flex-nowrap whitespace-nowrap rounded-md border border-border bg-muted/50 px-2 py-0.5 text-foreground/85 [&>svg]:text-primary/60",
  term:
    "inline-flex items-center gap-1.5 flex-nowrap whitespace-nowrap rounded-md border border-violet-200/70 bg-violet-50/80 px-2 py-0.5 text-violet-950 [&>svg]:text-violet-600",
  growth:
    "inline-flex items-center gap-1.5 flex-nowrap whitespace-nowrap rounded-md border border-emerald-200/70 bg-emerald-50/80 px-2 py-0.5 text-emerald-900 [&>svg]:text-emerald-600",
};
