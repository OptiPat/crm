import type { OrigineInvestissement } from "@/lib/api/tauri-investissements";

export type { OrigineInvestissement };

/** Saisi et suivi par le conseiller (encours officiels, dashboard). */
export function isMonConseilOrigine(origine: string | undefined): boolean {
  return origine === "MON_CONSEIL";
}

/** Saisi par le conseiller depuis un document client (vérifié). */
export function isExistantClientOrigine(origine: string | undefined): boolean {
  return origine === "EXISTANT_CLIENT";
}

/** Déclaré par le client dans l'espace (non vérifié). */
export function isDeclareClientOrigine(origine: string | undefined): boolean {
  return origine === "DECLARE_CLIENT";
}

/**
 * Patrimoine « à côté » du conseil (existant vérifié + déclaratif client).
 *
 * Les agrégats dashboard / stats restent filtrés sur `MON_CONSEIL` :
 * `DECLARE_CLIENT` en est exclu au même titre que `EXISTANT_CLIENT`.
 */
export function isPatrimoineACoteOrigine(origine: string | undefined): boolean {
  return origine != null && origine !== "MON_CONSEIL";
}
