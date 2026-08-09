import type { Investissement } from "@/lib/api/tauri-investissements";
import { formatEuroCentimes } from "@/lib/investissements/investissement-display";

/** Total hero — compact au-delà du million. */
export function formatClientPreviewTotal(centimes: number): string {
  if (centimes >= 1_000_000_00) {
    const millions = centimes / 100_000_000;
    const formatted = millions.toLocaleString("fr-FR", {
      maximumFractionDigits: millions >= 10 ? 0 : 1,
    });
    return `${formatted} M€`;
  }
  return formatEuroCentimes(centimes);
}

/** Total centre donut — plus court pour éviter le débordement. */
export function formatChartCenterTotal(centimes: number): string {
  if (centimes >= 1_000_000_00) {
    return formatClientPreviewTotal(centimes);
  }
  if (centimes >= 100_000_00) {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(centimes / 100);
  }
  return formatEuroCentimes(centimes);
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
  return formatEuroCentimes(centimes);
}
