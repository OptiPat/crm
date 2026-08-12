import type { Investissement } from "@/lib/api/tauri-investissements";
import { IMMOBILIER_TYPES } from "@/lib/investissements/investissement-display";
import {
  isDeclareClientOrigine,
  isExistantClientOrigine,
} from "@/lib/investissements/investissement-origine";
import { isScpiValorisationType } from "@/lib/investissements/investissement-encours";
import { getPatrimoineCategorie } from "@/lib/patrimoine/categories";
import {
  PLAFOND_DECLARATION_CENTIMES,
  parseDeclarationDate,
  type ScpiClientDeclarationError,
  type ScpiClientDeclarationInput,
  type ScpiClientDeclarationValidation,
} from "./scpi-client-tracking";

const IMMOBILIER_SET = new Set<string>(IMMOBILIER_TYPES);

export type ClientInvestissementUpdateKind = "scpi" | "encours" | "immobilier";

function isOrigineACote(origine: string | undefined): boolean {
  // Whitelist stricte — miroir portail `is_a_cote` (pas « tout sauf MON_CONSEIL »).
  return isExistantClientOrigine(origine) || isDeclareClientOrigine(origine);
}

/**
 * SCPI : avec moi ou à côté (même formulaire, revenu inclus).
 * Épargne / placements / immobilier : uniquement hors « avec moi ».
 * Pas de création d'avoir — mise à jour de lignes déjà synchronisées.
 */
export function getClientInvestissementUpdateKind(
  inv: Pick<Investissement, "type_produit" | "origine">
): ClientInvestissementUpdateKind | null {
  if (isScpiValorisationType(inv.type_produit)) return "scpi";
  if (!isOrigineACote(inv.origine)) return null;
  // getPatrimoineCategorie("AUTRE") retombe sur « Placements financiers » :
  // on l'exclut explicitement, comme le portail et l'import CRM.
  if (!inv.type_produit || inv.type_produit === "AUTRE") return null;
  if (IMMOBILIER_SET.has(inv.type_produit)) return "immobilier";
  const cat = getPatrimoineCategorie(inv.type_produit);
  if (cat === "Épargne bancaire" || cat === "Placements financiers") {
    return "encours";
  }
  return null;
}

export function isClientInvestissementUpdateEligible(
  inv: Pick<Investissement, "type_produit" | "origine">
): boolean {
  return getClientInvestissementUpdateKind(inv) != null;
}

export interface ClientInvestissementUpdateInput
  extends ScpiClientDeclarationInput {
  loyerMensuelCentimes?: number | null;
  mensualiteCreditCentimes?: number | null;
  /** Jour civil YYYY-MM-DD, ou vide pour ne pas toucher. */
  dateFinPret?: string | null;
}

export interface ClientInvestissementUpdateValidation
  extends ScpiClientDeclarationValidation {
  loyerMensuelCentimes: number | null;
  mensualiteCreditCentimes: number | null;
  dateFinPretTs: number | null;
  clearDateFinPret: boolean;
}

export type ClientInvestissementUpdateError =
  | ScpiClientDeclarationError
  | "loyer_invalide"
  | "mensualite_invalide"
  | "date_fin_pret_invalide";

function startOfLocalDay(unix: number): number {
  const d = new Date(unix * 1000);
  d.setHours(0, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

function parseOptionalMoney(
  value: number | null | undefined,
  emptyAsNull: boolean
): number | null | "invalid" {
  if (value == null || value === undefined) {
    return emptyAsNull ? null : "invalid";
  }
  const n = Math.round(value);
  if (!Number.isFinite(n) || n < 0 || n > PLAFOND_DECLARATION_CENTIMES) {
    return "invalid";
  }
  return n;
}

/** Valide une mise à jour client (SCPI, encours à côté, ou immobilier à côté). */
export function validateClientInvestissementUpdate(
  inv: Pick<Investissement, "id" | "type_produit" | "origine">,
  input: ClientInvestissementUpdateInput,
  nowUnix = Math.floor(Date.now() / 1000)
): ClientInvestissementUpdateValidation | ClientInvestissementUpdateError {
  const kind = getClientInvestissementUpdateKind(inv);
  if (!kind) return "investissement_ineligible";
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
  if (kind === "scpi") {
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
  }

  let loyerMensuelCentimes: number | null = null;
  let mensualiteCreditCentimes: number | null = null;
  let dateFinPretTs: number | null = null;
  let clearDateFinPret = false;

  if (kind === "immobilier") {
    const loyer = parseOptionalMoney(input.loyerMensuelCentimes, true);
    if (loyer === "invalid") return "loyer_invalide";
    loyerMensuelCentimes = loyer;

    const mensualite = parseOptionalMoney(input.mensualiteCreditCentimes, true);
    if (mensualite === "invalid") return "mensualite_invalide";
    mensualiteCreditCentimes = mensualite;

    if (input.dateFinPret !== undefined && input.dateFinPret !== null) {
      const rawFin = input.dateFinPret.trim();
      if (rawFin === "") {
        clearDateFinPret = true;
      } else {
        const fin = parseDeclarationDate(rawFin);
        if (fin == null) return "date_fin_pret_invalide";
        dateFinPretTs = fin;
      }
    }
  }

  return {
    ok: true,
    dateTs,
    valorisationCentimes,
    revenuPercuCentimes,
    loyerMensuelCentimes,
    mensualiteCreditCentimes,
    dateFinPretTs,
    clearDateFinPret,
  };
}
