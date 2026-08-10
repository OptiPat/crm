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

/** Total hero — compact au-delà du million. */
export function formatClientPreviewTotal(centimes: number): string {
  if (centimes >= 1_000_000_00) {
    const millions = Math.round(centimes / 100) / 1_000_000;
    const formatted = millions.toLocaleString("fr-FR", {
      maximumFractionDigits: millions >= 10 ? 0 : 1,
    });
    return `${formatted} M€`;
  }
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
