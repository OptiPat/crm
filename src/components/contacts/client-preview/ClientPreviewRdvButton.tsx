import { CalendarPlus } from "lucide-react";
import { CP } from "./client-preview-theme";

interface ClientPreviewRdvButtonProps {
  /** Adresse choisie par le conseiller. Absente : aucun bouton. */
  url?: string;
  libelle?: string;
}

/**
 * Bouton de prise de rendez-vous, indépendant des échéances.
 *
 * Une seule adresse, désignée par le conseiller dans ses réglages : faire
 * choisir le client entre « bilan annuel » et « point rapide » lui demanderait
 * une décision qui n'est pas la sienne.
 */
export function ClientPreviewRdvButton({
  url,
  libelle = "Prendre rendez-vous",
}: ClientPreviewRdvButtonProps) {
  if (!url) return null;

  return (
    <a href={url} target="_blank" rel="noreferrer noopener" className={CP.rdvButton}>
      <CalendarPlus className="h-4 w-4" aria-hidden />
      {libelle}
    </a>
  );
}
