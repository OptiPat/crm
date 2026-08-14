import {
  parseDeclarationDate,
  PLAFOND_DECLARATION_CENTIMES,
  startOfUtcDay,
  DECLARATION_DATE_GRACE_SECONDS,
} from "./scpi-client-tracking";
import {
  isAvoirPanier,
  isTypeAutorisePourPanier,
  normaliserNomProduit,
  panierEstImmobilier,
  type AvoirPanier,
} from "./client-avoir-catalogue";

const NOM_MIN = 2;
const NOM_MAX = 80;

export interface ClientAvoirDeclarationInput {
  panier: string;
  typeProduit: string;
  nomProduit: string;
  valorisationCentimes: number;
  /** YYYY-MM-DD, optionnelle. */
  dateSouscription?: string | null;
  /** Immobilier uniquement — optionnels. */
  loyerMensuelCentimes?: number | null;
  mensualiteCreditCentimes?: number | null;
  /** YYYY-MM-DD. La fin de prêt peut être dans le futur. */
  dateFinPret?: string | null;
  /** Favori https du client — ignoré hors portail, jamais envoyé au CRM. */
  extranetUrl?: string | null;
}

export type ClientAvoirDeclarationError =
  | "panier_invalide"
  | "type_invalide"
  | "nom_invalide"
  | "valorisation_invalide"
  | "date_souscription_invalide"
  | "date_future"
  | "loyer_invalide"
  | "mensualite_invalide"
  | "date_fin_pret_invalide";

export interface ClientAvoirDeclarationValidation {
  ok: true;
  panier: AvoirPanier;
  typeProduit: string;
  nomProduit: string;
  valorisationCentimes: number;
  dateSouscription: string | null;
  loyerMensuelCentimes: number | null;
  mensualiteCreditCentimes: number | null;
  dateFinPret: string | null;
}

function parseOptionalMoney(
  value: number | null | undefined
): number | null | "invalid" {
  if (value == null) return null;
  const n = Math.round(value);
  if (!Number.isFinite(n) || n < 0 || n > PLAFOND_DECLARATION_CENTIMES) {
    return "invalid";
  }
  return n;
}

export function validateClientAvoirDeclaration(
  input: ClientAvoirDeclarationInput,
  nowUnix = Math.floor(Date.now() / 1000)
): ClientAvoirDeclarationValidation | ClientAvoirDeclarationError {
  if (!isAvoirPanier(input.panier)) return "panier_invalide";
  const panier = input.panier;
  const typeProduit = input.typeProduit.trim();
  if (!typeProduit || !isTypeAutorisePourPanier(panier, typeProduit)) {
    return "type_invalide";
  }

  const nomProduit = input.nomProduit.trim().replace(/\s+/g, " ");
  if (nomProduit.length < NOM_MIN || nomProduit.length > NOM_MAX) {
    return "nom_invalide";
  }

  const valorisationCentimes = Math.round(input.valorisationCentimes);
  if (
    !Number.isFinite(valorisationCentimes) ||
    valorisationCentimes <= 0 ||
    valorisationCentimes > PLAFOND_DECLARATION_CENTIMES
  ) {
    return "valorisation_invalide";
  }

  const rawDate = input.dateSouscription?.trim() ?? "";
  let dateSouscription: string | null = null;
  if (rawDate) {
    const dateTs = parseDeclarationDate(rawDate);
    if (dateTs == null) return "date_souscription_invalide";
    if (dateTs > startOfUtcDay(nowUnix) + DECLARATION_DATE_GRACE_SECONDS) {
      return "date_future";
    }
    dateSouscription = rawDate;
  }

  let loyerMensuelCentimes: number | null = null;
  let mensualiteCreditCentimes: number | null = null;
  let dateFinPret: string | null = null;
  if (panierEstImmobilier(panier)) {
    const loyer = parseOptionalMoney(input.loyerMensuelCentimes);
    if (loyer === "invalid") return "loyer_invalide";
    loyerMensuelCentimes = loyer;
    const mensualite = parseOptionalMoney(input.mensualiteCreditCentimes);
    if (mensualite === "invalid") return "mensualite_invalide";
    mensualiteCreditCentimes = mensualite;
    const rawFin = input.dateFinPret?.trim() ?? "";
    if (rawFin) {
      if (parseDeclarationDate(rawFin) == null) return "date_fin_pret_invalide";
      dateFinPret = rawFin;
    }
  }

  return {
    ok: true,
    panier,
    typeProduit,
    nomProduit,
    valorisationCentimes,
    dateSouscription,
    loyerMensuelCentimes,
    mensualiteCreditCentimes,
    dateFinPret,
  };
}

export function nomsProduitsIdentiques(a: string, b: string): boolean {
  return normaliserNomProduit(a) === normaliserNomProduit(b);
}
