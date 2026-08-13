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
  startOfUtcDay,
  DECLARATION_DATE_GRACE_SECONDS,
  type ScpiClientDeclarationError,
  type ScpiClientDeclarationInput,
  type ScpiClientDeclarationValidation,
} from "./scpi-client-tracking";

const IMMOBILIER_SET = new Set<string>(IMMOBILIER_TYPES);

export type ClientInvestissementUpdateKind = "scpi" | "encours" | "immobilier";

/**
 * Nature de la ligne telle que la photo l'annonce, quand elle la connaît.
 *
 * Sur le portail, c'est le serveur qui tranche à l'enregistrement : classer
 * l'écran avec les listes du CRM ferait apparaître un bouton que l'API
 * refuserait ensuite — le client remplirait le formulaire pour rien. Dans
 * l'aperçu du conseiller, aucune photo n'est en jeu : le CRM est la source, et
 * ses listes font foi.
 */
export interface ClientInvestissementNature {
  estScpi?: boolean;
  estImmobilier?: boolean;
}

export type ClientInvestissementNatureById = Map<
  number,
  ClientInvestissementNature
>;

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
  inv: Pick<Investissement, "type_produit" | "origine"> & { id?: number },
  nature?: ClientInvestissementNature
): ClientInvestissementUpdateKind | null {
  // Ligne overlay (déclaration pas encore reprise) : pas de mise à jour.
  if (inv.id != null && inv.id < 0) return null;
  const estScpi = nature?.estScpi ?? isScpiValorisationType(inv.type_produit);
  if (estScpi) return "scpi";
  if (!isOrigineACote(inv.origine)) return null;
  if (!inv.type_produit || inv.type_produit === "PREVOYANCE") return null;
  const estImmobilier =
    nature?.estImmobilier ?? IMMOBILIER_SET.has(inv.type_produit);
  if (estImmobilier) return "immobilier";
  const cat = getPatrimoineCategorie(inv.type_produit);
  if (cat === "Épargne bancaire" || cat === "Placements financiers") {
    return "encours";
  }
  return null;
}

export function isClientInvestissementUpdateEligible(
  inv: Pick<Investissement, "type_produit" | "origine"> & { id?: number },
  nature?: ClientInvestissementNature
): boolean {
  return getClientInvestissementUpdateKind(inv, nature) != null;
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

/** Champs du formulaire client, tels qu'ils sont saisis. */
export interface ClientInvestissementFormFields {
  /** Jour civil YYYY-MM-DD. */
  date: string;
  /** Montants en euros, saisie brute (« 1 250,50 »). */
  valorisation: string;
  revenu: string;
  loyer: string;
  mensualite: string;
  /** Jour civil YYYY-MM-DD, ou vide. */
  dateFinPret: string;
}

/** Euros saisis en centimes. Saisie vide ou illisible : 0. */
export function parseEurosInput(value: string): number {
  const normalized = value.replace(/\s/g, "").replace(",", ".");
  const n = Number.parseFloat(normalized);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

/** Timestamp en valeur de champ date, vide si absent. */
export function unixToDateInput(unix?: number | null): string {
  if (unix == null || unix <= 0) return "";
  const d = new Date(unix * 1000);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Traduit le formulaire en mise à jour, **en n'envoyant que ce que le client a
 * changé**.
 *
 * Le formulaire pré-remplit loyer, mensualité et fin de prêt avec les valeurs
 * du dossier : les renvoyer systématiquement reviendrait à réaffirmer une photo
 * vieille de plusieurs minutes. Si le conseiller a saisi une fin de prêt entre
 * l'ouverture de l'écran et l'enregistrement, cette réaffirmation l'effacerait
 * — le client n'ayant rien touché, personne ne comprendrait la disparition.
 *
 * Un champ inchangé est donc absent de la requête, ce que le portail lit comme
 * « ne pas toucher ». Vidé volontairement, il vaut 0 € ou date effacée.
 */
export function buildClientInvestissementUpdateInput(
  inv: Pick<
    Investissement,
    | "id"
    | "type_produit"
    | "origine"
    | "loyer_mensuel"
    | "mensualite_credit"
    | "date_fin_pret"
  >,
  fields: ClientInvestissementFormFields,
  nature?: ClientInvestissementNature
): ClientInvestissementUpdateInput {
  const kind = getClientInvestissementUpdateKind(inv, nature);
  const input: ClientInvestissementUpdateInput = {
    investissementId: inv.id,
    date: fields.date,
    valorisationCentimes: parseEurosInput(fields.valorisation),
  };

  if (kind === "scpi") {
    input.revenuPercuCentimes = fields.revenu.trim()
      ? parseEurosInput(fields.revenu)
      : null;
  }

  if (kind === "immobilier") {
    const loyer = fields.loyer.trim() ? parseEurosInput(fields.loyer) : 0;
    if (loyer !== (inv.loyer_mensuel ?? 0)) {
      input.loyerMensuelCentimes = loyer;
    }
    const mensualite = fields.mensualite.trim()
      ? parseEurosInput(fields.mensualite)
      : 0;
    if (mensualite !== (inv.mensualite_credit ?? 0)) {
      input.mensualiteCreditCentimes = mensualite;
    }
    if (fields.dateFinPret.trim() !== unixToDateInput(inv.date_fin_pret)) {
      input.dateFinPret = fields.dateFinPret;
    }
  }

  return input;
}

/** Valide une mise à jour client (SCPI, encours à côté, ou immobilier à côté). */
export function validateClientInvestissementUpdate(
  inv: Pick<Investissement, "id" | "type_produit" | "origine">,
  input: ClientInvestissementUpdateInput,
  nowUnix = Math.floor(Date.now() / 1000),
  nature?: ClientInvestissementNature
): ClientInvestissementUpdateValidation | ClientInvestissementUpdateError {
  const kind = getClientInvestissementUpdateKind(inv, nature);
  if (!kind) return "investissement_ineligible";
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
