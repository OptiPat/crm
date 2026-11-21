import { formatEuroCentimes } from "@/lib/investissements/investissement-display";

/**
 * Titre de la note de journal écrite à la confirmation d'envoi Stellium.
 * Souscription : montant ajouté pour distinguer deux souscriptions du même produit
 * (ex. « Souscription — Cristalliance Avenir — 70 000 € »). Affichage seul : le
 * rattachement note ↔ opération passe par `pipe_timeline_entry_id`.
 */
export function stelliumJournalTitre(options: {
  label: string;
  product: string;
  versementComplementaire: boolean;
  operationType: string;
  montantCentimes?: number | null;
}): string {
  const { label, product, versementComplementaire, operationType, montantCentimes } = options;
  if (versementComplementaire && !product) return label;
  const base = `${label} — ${product}`;
  if (operationType === "SOUSCRIPTION" && montantCentimes != null && montantCentimes > 0) {
    return `${base} — ${formatEuroCentimes(montantCentimes)}`;
  }
  return base;
}
