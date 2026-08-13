import type { Investissement } from "@/lib/api/tauri-investissements";
import { isScpiValorisationType } from "@/lib/investissements/investissement-encours";

/** SCPI suivies par le client : pleine propriété, fiscale ou démembrement. */
export function isScpiClientTrackingType(typeProduit: string | undefined): boolean {
  return isScpiValorisationType(typeProduit);
}

/**
 * SCPI pleine propriété, fiscale ou démembrement — « avec moi » ou à côté.
 * Le revenu / dividendes reste proposé dans les deux cas.
 */
export function isScpiClientTrackingEligible(
  inv: Pick<Investissement, "type_produit" | "origine">
): boolean {
  return isScpiClientTrackingType(inv.type_produit);
}

export interface ScpiClientDeclarationInput {
  investissementId: number;
  /** Jour civil (YYYY-MM-DD ou timestamp unix du jour). */
  date: string;
  valorisationCentimes: number;
  /** Optionnel — 0 ou absent si aucun revenu ce jour-là. */
  revenuPercuCentimes?: number | null;
}

export interface ScpiClientDeclarationValidation {
  ok: true;
  dateTs: number;
  valorisationCentimes: number;
  revenuPercuCentimes: number | null;
}

/**
 * Dix millions d'euros par ligne, en miroir du plafond du portail. Ce n'est
 * pas une protection — ce sont les données du client — mais une faute de
 * frappe polluerait sinon l'historique de valorisations du CRM.
 */
export const PLAFOND_DECLARATION_CENTIMES = 1_000_000_000;

export type ScpiClientDeclarationError =
  | "investissement_ineligible"
  | "date_invalide"
  | "valorisation_invalide"
  | "revenu_invalide"
  | "date_future";

/** Valide une déclaration SCPI client avant envoi au portail. */
export function validateScpiClientDeclaration(
  inv: Pick<Investissement, "id" | "type_produit" | "origine">,
  input: ScpiClientDeclarationInput,
  nowUnix = Math.floor(Date.now() / 1000)
): ScpiClientDeclarationValidation | ScpiClientDeclarationError {
  if (!isScpiClientTrackingEligible(inv)) return "investissement_ineligible";
  if (input.investissementId !== inv.id) return "investissement_ineligible";

  const dateTs = parseDeclarationDate(input.date);
  if (dateTs == null) return "date_invalide";
  if (dateTs > startOfUtcDay(nowUnix) + DECLARATION_DATE_GRACE_SECONDS) {
    return "date_future";
  }

  const valorisationCentimes = Math.round(input.valorisationCentimes);
  if (
    !Number.isFinite(valorisationCentimes) ||
    valorisationCentimes <= 0 ||
    valorisationCentimes > PLAFOND_DECLARATION_CENTIMES
  ) {
    return "valorisation_invalide";
  }

  let revenuPercuCentimes: number | null = null;
  if (
    input.revenuPercuCentimes != null &&
    input.revenuPercuCentimes !== undefined &&
    input.revenuPercuCentimes !== 0
  ) {
    const revenu = Math.round(input.revenuPercuCentimes);
    if (
      !Number.isFinite(revenu) ||
      revenu < 0 ||
      revenu > PLAFOND_DECLARATION_CENTIMES
    ) {
      return "revenu_invalide";
    }
    revenuPercuCentimes = revenu;
  }

  return {
    ok: true,
    dateTs,
    valorisationCentimes,
    revenuPercuCentimes,
  };
}

export function startOfUtcDay(unix: number): number {
  const d = new Date(unix * 1000);
  return Math.floor(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 1000
  );
}

/**
 * Un jour de battement : le client saisit le jour de son fuseau, qui peut
 * être en avance sur UTC en début de nuit. Même règle que le portail
 * (`start_of_today_utc() + 86_400`).
 */
export const DECLARATION_DATE_GRACE_SECONDS = 86_400;

/** Accepte YYYY-MM-DD (minuit UTC) ou timestamp unix (jour UTC). */
export function parseDeclarationDate(value: string): number | null {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [y, m, d] = trimmed.split("-").map(Number);
    const utcMs = Date.UTC(y, m - 1, d);
    const date = new Date(utcMs);
    if (
      date.getUTCFullYear() !== y ||
      date.getUTCMonth() !== m - 1 ||
      date.getUTCDate() !== d
    ) {
      return null;
    }
    return utcMs / 1000;
  }
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n <= 0) return null;
  return startOfUtcDay(n);
}

/** Dernière valorisation connue pour pré-remplir le formulaire. */
export function defaultValorisationCentimes(
  inv: Pick<Investissement, "encours_actuel" | "montant_initial">,
  history?: Array<{ dateTs: number; montantCentimes: number }>
): number {
  if (history && history.length > 0) {
    const latest = [...history].sort((a, b) => b.dateTs - a.dateTs)[0];
    if (latest.montantCentimes > 0) return latest.montantCentimes;
  }
  if (inv.encours_actuel != null && inv.encours_actuel > 0) {
    return inv.encours_actuel;
  }
  return inv.montant_initial ?? 0;
}
