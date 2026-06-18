import type { Investissement } from "@/lib/api/tauri-investissements";
import type { Foyer } from "@/lib/api/tauri-foyers";
import { formatEuroCentimes, formatNomProduit } from "@/lib/investissements/investissement-display";
import { formatDemembrementDureeLabel } from "@/lib/investissements/investissement-demembrement";
import { groupPatrimoineByCategory } from "@/lib/investissements/patrimoine-tab-utils";
/** Nom commercial utile uniquement pour ces types (SCPI, FIP/FCPI, FCPR…). */
const FINANCIER_TYPES_WITH_NOM = new Set([
  "SCPI",
  "SCPI_DEMEMBREMENT",
  "SCPI_FISCALE",
  "FIP_FCPI",
  "FCPR",
  "G3F",
]);

function primaryAmountCentimes(inv: Investissement): number | undefined {
  const amount = inv.encours_actuel ?? inv.montant_initial;
  return amount != null && amount > 0 ? amount : undefined;
}

function immobilierFinancingDetails(inv: Investissement): string[] {
  const details: string[] = [];
  const amount = primaryAmountCentimes(inv);
  if (amount != null) {
    details.push(formatEuroCentimes(amount));
  }
  if (inv.loyer_mensuel != null && inv.loyer_mensuel > 0) {
    details.push(`loyer ${formatEuroCentimes(inv.loyer_mensuel)}/mois`);
  }
  if (inv.mensualite_credit != null && inv.mensualite_credit > 0) {
    details.push(`mensualité ${formatEuroCentimes(inv.mensualite_credit)}/mois`);
  }
  return details;
}

function formatImmobilierEntry(inv: Investissement): string {
  const typeLabel = formatNomProduit(inv.type_produit);
  const details = immobilierFinancingDetails(inv);
  if (details.length === 0) return typeLabel;
  return `${typeLabel} : ${details.join(", ")}`;
}

function shouldShowFinancialNomProduit(typeProduit: string): boolean {
  return FINANCIER_TYPES_WITH_NOM.has(typeProduit.toUpperCase());
}

function formatFinancierEntry(inv: Investissement): string {
  const typeLabel = formatNomProduit(inv.type_produit);
  const name = inv.nom_produit?.trim();
  const label =
    shouldShowFinancialNomProduit(inv.type_produit) && name ? `${typeLabel} (${name})` : typeLabel;

  const parts = [label];
  const dureeDemembrement = formatDemembrementDureeLabel(inv);
  if (dureeDemembrement) parts.push(dureeDemembrement);
  const amount = primaryAmountCentimes(inv);
  if (amount != null) {
    parts.push(formatEuroCentimes(amount));
  }
  return parts.join(" ");
}

function summarizePatrimoineEntries(
  investissements: readonly Investissement[],
  formatEntry: (inv: Investissement) => string
): string | null {
  if (investissements.length === 0) return null;

  const lines = investissements.map(formatEntry);
  return lines.length > 0 ? lines.join(" ; ") : null;
}

/** Patrimoine du client sélectionné + investissements communs au foyer (pas le conjoint seul). */
export function filterRappelPatrimoineInvestissements(
  contactId: number,
  investissements: readonly Investissement[]
): Investissement[] {
  return investissements.filter((inv) => {
    if (inv.foyer_id != null && inv.foyer_id > 0) return true;
    return inv.contact_id === contactId;
  });
}

/** Texte foyer prioritaire, sinon synthèse des investissements immo du patrimoine. */
export function resolveRappelImmobilierLine(
  foyer: Foyer | null,
  investissements: readonly Investissement[]
): string | null {
  const foyerText = foyer?.situation_patrimoniale?.trim();
  if (foyerText) return foyerText;

  const { immobilier } = groupPatrimoineByCategory([...investissements]);
  return summarizePatrimoineEntries(immobilier, formatImmobilierEntry);
}

/** Synthèse des placements financiers (SCPI, AV, PER…). */
export function resolveRappelValeursMobilieresLine(
  investissements: readonly Investissement[]
): string | null {
  const { financier } = groupPatrimoineByCategory([...investissements]);
  return summarizePatrimoineEntries(financier, formatFinancierEntry);
}
