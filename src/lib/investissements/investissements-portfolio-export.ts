import type { InvestissementWithDetails } from "@/lib/api/tauri-investissements";
import { formatCalendarDateFr } from "@/lib/dates/calendar-date";
import {
  getEffectiveEncoursCentimes,
  isPlacementEncoursEligible,
} from "@/lib/investissements/investissement-encours";
import { hasScpiCredit } from "@/lib/investissements/investissement-scpi-reinvest";
import { hasActiveVersementProgramme } from "@/lib/investissements/investissement-versements";
import {
  getInvestissementStatutLabel,
  isInvestissementActifEncours,
} from "@/lib/investissements/investissement-statut";

export const INVESTISSEMENTS_CSV_HEADERS = [
  "Produit",
  "Type",
  "Montant souscrit (€)",
  "Encours (€)",
  "Versement programmé",
  "Montant VP (€)",
  "Fréquence VP",
  "Réinvest. dividendes",
  "Client prénom",
  "Client nom",
  "ID contact",
  "Foyer",
  "Partenaire",
  "Origine",
  "Statut",
  "Date clôture",
  "Date souscription",
  "Fin démembrement",
  "Crédit SCPI",
  "Notes",
] as const;

function euroFromCentimes(centimes?: number | null): string {
  if (centimes == null) return "";
  return (centimes / 100).toFixed(2);
}

export function investissementToCsvRow(inv: InvestissementWithDetails): string[] {
  const encoursEligible =
    isInvestissementActifEncours(inv) &&
    isPlacementEncoursEligible(inv.type_produit);
  const encoursCentimes = encoursEligible ? getEffectiveEncoursCentimes(inv) : null;
  const hasVp = hasActiveVersementProgramme(inv);

  return [
    inv.nom_produit,
    inv.type_produit,
    euroFromCentimes(inv.montant_initial),
    encoursEligible ? euroFromCentimes(encoursCentimes) : "",
    hasVp ? "Oui" : "Non",
    hasVp ? euroFromCentimes(inv.montant_versement_programme) : "",
    hasVp ? (inv.frequence_versement ?? "") : "",
    inv.reinvestissement_dividendes ? "Oui" : "Non",
    inv.contact_id ? inv.contact_prenom : "Commun",
    inv.contact_id ? inv.contact_nom : inv.foyer_nom ?? "",
    inv.contact_id != null ? String(inv.contact_id) : "",
    inv.foyer_nom ?? "",
    inv.partenaire_nom ?? "",
    inv.origine === "MON_CONSEIL" ? "Avec moi" : "À côté",
    getInvestissementStatutLabel(inv.statut),
    inv.date_cloture ? formatCalendarDateFr(inv.date_cloture) : "",
    inv.date_souscription ? formatCalendarDateFr(inv.date_souscription) : "",
    inv.date_fin_demembrement ? formatCalendarDateFr(inv.date_fin_demembrement) : "",
    hasScpiCredit(inv) ? "Oui" : "Non",
    inv.notes ?? "",
  ];
}

export function investissementsToCsvRows(
  items: InvestissementWithDetails[]
): string[][] {
  return items.map(investissementToCsvRow);
}
