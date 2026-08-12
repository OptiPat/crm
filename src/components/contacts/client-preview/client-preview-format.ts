import type { Investissement } from "@/lib/api/tauri-investissements";

/** Montant espace client — arrondi à l'euro, sans centimes. */
export function formatClientPreviewEuro(centimes: number): string {
  if (centimes <= 0) return "-";
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(centimes / 100));
}

/**
 * Total hero — montant exact, comme toutes les autres lignes de l'écran.
 *
 * La forme compacte affichait « 1 M€ » pour 1 004 299 € : un chiffre rond qui
 * ne correspondait à la somme d'aucune des lignes affichées juste en dessous.
 * Le hero et le centre du camembert réduisent leur police pour tenir, la
 * longueur n'est donc pas un obstacle.
 */
export function formatClientPreviewTotal(centimes: number): string {
  return formatClientPreviewEuro(centimes);
}

/** Total centre donut — aligné sur le hero. */
export function formatChartCenterTotal(centimes: number): string {
  return formatClientPreviewTotal(centimes);
}

export function getLatestValorisationLabel(
  investissements: Pick<Investissement, "encours_date">[]
): string | null {
  let latest: number | undefined;
  for (const inv of investissements) {
    if (inv.encours_date && (!latest || inv.encours_date > latest)) {
      latest = inv.encours_date;
    }
  }
  if (!latest) return null;
  return new Date(latest * 1000).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function formatShortEuro(centimes: number): string {
  return formatClientPreviewEuro(centimes);
}
