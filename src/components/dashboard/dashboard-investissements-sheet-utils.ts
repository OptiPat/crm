import type { InvestissementWithDetails } from "@/lib/api/tauri-investissements";
import { formatCalendarDateFr } from "@/lib/dates/calendar-date";
import { formatEuroCentimes, formatNomProduit } from "@/lib/investissements/investissement-display";
import { getEffectiveEncoursCentimes } from "@/lib/investissements/investissement-encours";
import { versementProgrammeAnnuelCentimes } from "@/lib/investissements/investissement-versements";

const FREQUENCE_LABELS: Record<string, string> = {
  MENSUEL: "mois",
  TRIMESTRIEL: "trimestre",
  SEMESTRIEL: "semestre",
  ANNUEL: "an",
};

export function investissementOwnerLabel(inv: InvestissementWithDetails): string {
  if (inv.contact_id != null) {
    return [inv.contact_prenom, inv.contact_nom].filter(Boolean).join(" ");
  }
  if (inv.foyer_nom) {
    return `Foyer · ${inv.foyer_nom}`;
  }
  return "Propriétaire inconnu";
}

export function immobilierInvestissementSubtitle(inv: InvestissementWithDetails): string {
  const parts: string[] = [formatNomProduit(inv.type_produit)];
  if (inv.montant_initial != null && inv.montant_initial > 0) {
    parts.push(formatEuroCentimes(inv.montant_initial));
  }
  if (inv.date_souscription) {
    parts.push(formatCalendarDateFr(inv.date_souscription));
  }
  return parts.join(" · ");
}

export function placementsInvestissementSubtitle(inv: InvestissementWithDetails): string {
  const parts: string[] = [formatNomProduit(inv.type_produit)];
  const encours = getEffectiveEncoursCentimes(inv);
  if (encours > 0) {
    parts.push(`Encours ${formatEuroCentimes(encours)}`);
  }
  if (inv.partenaire_nom?.trim()) {
    parts.push(inv.partenaire_nom.trim());
  }
  return parts.join(" · ");
}

export function versementsInvestissementSubtitle(inv: InvestissementWithDetails): string {
  const montant = inv.montant_versement_programme ?? 0;
  const freqKey = inv.frequence_versement ?? "MENSUEL";
  const freqLabel = FREQUENCE_LABELS[freqKey] ?? "mois";
  const annuel = versementProgrammeAnnuelCentimes(montant, inv.frequence_versement);
  return [
    formatNomProduit(inv.type_produit),
    `${formatEuroCentimes(montant)} / ${freqLabel}`,
    `${formatEuroCentimes(annuel)} / an`,
  ].join(" · ");
}

export function sortInvestissementsByOwnerThenName(
  items: InvestissementWithDetails[]
): InvestissementWithDetails[] {
  return [...items].sort((a, b) => {
    const ownerA = investissementOwnerLabel(a).toLocaleLowerCase("fr");
    const ownerB = investissementOwnerLabel(b).toLocaleLowerCase("fr");
    if (ownerA !== ownerB) return ownerA.localeCompare(ownerB, "fr");
    return formatNomProduit(a.nom_produit).localeCompare(formatNomProduit(b.nom_produit), "fr");
  });
}
