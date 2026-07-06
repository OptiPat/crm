import { invoke } from "@tauri-apps/api/core";
import { buildGeocodeQueries } from "@/lib/compta/compta-geocode-queries";
import { roundComptaMoney } from "@/lib/compta/compta-money";

/** Distance aller simple en km (Nominatim + OSRM via Rust). */
export async function computeDrivingDistanceKm(
  origin: string,
  destination: string
): Promise<number> {
  return invoke<number>("compute_compta_driving_distance_km", {
    origin,
    destination,
    originQueries: buildGeocodeQueries(origin),
    destinationQueries: buildGeocodeQueries(destination),
  });
}

/** Aller-retour × barème km. */
export function computeIndemniteKm(
  oneWayKm: number,
  indemniteKm: number
): { roundTripKm: number; indemnite: number } {
  const roundTripKm = roundComptaMoney(oneWayKm * 2);
  const indemnite = roundComptaMoney(roundTripKm * indemniteKm);
  return { roundTripKm, indemnite };
}

/** Réinitialise le cache adresse de départ (batch Agenda). */
export async function resetComptaDistanceCache(): Promise<void> {
  await invoke("reset_compta_distance_cache");
}
