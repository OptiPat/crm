import { SCPI_ANNEXE_PRODUCT_FICHES } from "@/lib/souscription-cif/scpi-annexe-catalog";

/** Frais de souscription retenus pour une SCPI absente du catalogue (ou fiche illisible). */
export const DEFAULT_SCPI_FRAIS_SOUSCRIPTION_PCT = 10;

const SCPI_TYPES = new Set(["SCPI", "SCPI_FISCALE", "SCPI_DEMEMBREMENT"]);

export function isScpiTypeProduit(typeProduit: string): boolean {
  return SCPI_TYPES.has(typeProduit.trim().toUpperCase());
}

function normalizeProductName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Taux lu dans la ligne « - Souscription : 10% HT » d'une fiche SCPI (ex. 11.964, 8,45). */
export function parseScpiFraisSouscriptionPct(description: string): number | null {
  const match = description.match(/Souscription\s*:\s*(\d+(?:[.,]\d+)?)\s*%/i);
  if (!match) return null;
  const pct = Number.parseFloat(match[1].replace(",", "."));
  return Number.isFinite(pct) && pct >= 0 && pct < 100 ? pct : null;
}

/**
 * Frais de souscription (%) d'une SCPI vendue dans le pipe : fiche produit du catalogue
 * CIF, sinon {@link DEFAULT_SCPI_FRAIS_SOUSCRIPTION_PCT}.
 */
export function scpiFraisSouscriptionPctForProduct(productLabel: string | null | undefined): number {
  const wanted = normalizeProductName(productLabel ?? "");
  if (wanted) {
    const fiche = SCPI_ANNEXE_PRODUCT_FICHES.find(
      (f) => normalizeProductName(f.label) === wanted
    );
    const pct = fiche ? parseScpiFraisSouscriptionPct(fiche.description) : null;
    if (pct != null) return pct;
  }
  return DEFAULT_SCPI_FRAIS_SOUSCRIPTION_PCT;
}

/**
 * Frais déduits de l'assiette de rémunération : toute SCPI, CIF ou non
 * ((montant − frais) × PV × TPC ; seul le PV dépend du CIF). `null` = aucune déduction.
 */
export function remunerationFraisDeduitsPct(options: {
  typeProduit: string;
  productLabel?: string | null;
}): number | null {
  if (!isScpiTypeProduit(options.typeProduit)) return null;
  return scpiFraisSouscriptionPctForProduct(options.productLabel);
}
