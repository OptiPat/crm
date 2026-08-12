import type { Investissement } from "@/lib/api/tauri-investissements";
import { isScpiValorisationType } from "@/lib/investissements/investissement-encours";

/** SCPI suivies par le client : pleine propriété, fiscale ou démembrement. */
export function isScpiClientTrackingType(typeProduit: string | undefined): boolean {
  return isScpiValorisationType(typeProduit);
}

/** Uniquement les placements conseillés — pas « déjà en place » ni déclarations externes. */
export function isScpiClientTrackingEligible(
  inv: Pick<Investissement, "type_produit" | "origine">
): boolean {
  return inv.origine === "MON_CONSEIL" && isScpiClientTrackingType(inv.type_produit);
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

/** Valide une déclaration client avant envoi au portail. */
export function validateScpiClientDeclaration(
  inv: Pick<Investissement, "id" | "type_produit" | "origine">,
  input: ScpiClientDeclarationInput,
  nowUnix = Math.floor(Date.now() / 1000)
): ScpiClientDeclarationValidation | ScpiClientDeclarationError {
  if (!isScpiClientTrackingEligible(inv)) return "investissement_ineligible";
  if (input.investissementId !== inv.id) return "investissement_ineligible";

  const dateTs = parseDeclarationDate(input.date);
  if (dateTs == null) return "date_invalide";
  if (dateTs > startOfLocalDay(nowUnix)) return "date_future";

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

function startOfLocalDay(unix: number): number {
  const d = new Date(unix * 1000);
  d.setHours(0, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

/** Accepte YYYY-MM-DD ou timestamp unix (jour). */
export function parseDeclarationDate(value: string): number | null {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [y, m, d] = trimmed.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    if (
      date.getFullYear() !== y ||
      date.getMonth() !== m - 1 ||
      date.getDate() !== d
    ) {
      return null;
    }
    return Math.floor(date.getTime() / 1000);
  }
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n <= 0) return null;
  return startOfLocalDay(n);
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
