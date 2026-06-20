import { parseExceltisGammeFromText } from "@/lib/etiquettes/exceltis";

/** Annonce à venir (newsletter « Bonne nouvelle … remboursements à venir ») vs remboursement effectué. */
export function isStelliumExceltisAnnonce(subject: string): boolean {
  return /bonne nouvelle|à venir|remboursements exceltis/i.test(subject);
}

/**
 * Libellé d'un signal Stellium. `etiquetteNom` (ex. « Exceltis Sérénité — Mai 2024 »)
 * permet d'afficher la gamme pour distinguer deux produits du même millésime.
 */
export function stelliumExceltisHeadline(
  subject: string,
  millesimeLabel: string,
  etiquetteNom?: string
): string {
  const gamme = etiquetteNom ? parseExceltisGammeFromText(etiquetteNom) : null;
  const label = gamme ? `${gamme} ${millesimeLabel}` : millesimeLabel;
  if (isStelliumExceltisAnnonce(subject)) {
    return `Exceltis annoncé — ${label}`;
  }
  return `Exceltis remboursé — ${label}`;
}
