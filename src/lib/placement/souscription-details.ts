import type {
  PlacementOperation,
  PlacementSouscriptionDetails,
} from "@/lib/api/tauri-box-placement";
import {
  acceptsReinvestissementDividendes,
  acceptsVersementProgramme,
  FREQUENCE_VERSEMENT_LABELS,
} from "@/lib/investissements/investissement-versements";
import { parseMontantEurosToCentimes } from "@/lib/pipe/placement-montant";

/** Titulaire d'une souscription affaire : `contact:<id>` ou `foyer:<id>`. */
export type SouscriptionHolderKey = `contact:${number}` | `foyer:${number}`;

export interface SouscriptionHolderPerson {
  id: number;
  civilite?: string | null;
  prenom?: string | null;
  nom?: string | null;
  foyer_id?: number | null;
}

export interface SouscriptionHolderFoyer {
  id: number;
  nom: string;
  /** Membres du foyer (contacts rattachés). */
  memberCount: number;
}

export interface SouscriptionHolderOption {
  key: SouscriptionHolderKey;
  label: string;
}

export interface SouscriptionHolderChoices {
  options: SouscriptionHolderOption[];
  /** Règle par défaut (identique au Rust) : commun si couple du même foyer, sinon contact principal. */
  defaultKey: SouscriptionHolderKey;
}

function civiliteAbbr(civilite?: string | null): string {
  if (civilite === "M") return "M.";
  if (civilite === "MME") return "Mme";
  return "";
}

function personLabel(person: SouscriptionHolderPerson): string {
  const label = [civiliteAbbr(person.civilite), person.prenom?.trim(), person.nom?.trim()]
    .filter(Boolean)
    .join(" ");
  return label || `Contact #${person.id}`;
}

/**
 * Foyer pertinent pour un titulaire « commun » : celui du contact principal.
 * Avec un co-contact, il n'est retenu que si les deux y sont (même règle que le Rust).
 */
export function souscriptionHolderFoyerId(
  primary: SouscriptionHolderPerson,
  secondary?: SouscriptionHolderPerson | null
): number | null {
  const foyerId = primary.foyer_id != null && primary.foyer_id > 0 ? primary.foyer_id : null;
  if (!foyerId) return null;
  if (secondary && secondary.id > 0 && secondary.foyer_id !== foyerId) return null;
  return foyerId;
}

export function buildSouscriptionHolderChoices(input: {
  primary: SouscriptionHolderPerson;
  secondary?: SouscriptionHolderPerson | null;
  foyer?: SouscriptionHolderFoyer | null;
}): SouscriptionHolderChoices {
  const { primary, secondary, foyer } = input;
  const options: SouscriptionHolderOption[] = [
    { key: `contact:${primary.id}`, label: personLabel(primary) },
  ];
  if (secondary && secondary.id > 0 && secondary.id !== primary.id) {
    options.push({ key: `contact:${secondary.id}`, label: personLabel(secondary) });
  }
  const hasSecondary = !!secondary && secondary.id > 0 && secondary.id !== primary.id;
  const coupleSameFoyer =
    hasSecondary &&
    primary.foyer_id != null &&
    primary.foyer_id > 0 &&
    secondary.foyer_id === primary.foyer_id;
  // « Commun » : avec co-contact, seulement si les deux sont dans le même foyer ;
  // sans co-contact, seulement si le foyer compte au moins 2 membres (client seul : pas de choix).
  const communAllowed =
    !!foyer &&
    foyer.id === primary.foyer_id &&
    (hasSecondary ? coupleSameFoyer : foyer.memberCount >= 2);
  if (foyer && communAllowed) {
    options.push({ key: `foyer:${foyer.id}`, label: `Commun (foyer ${foyer.nom})` });
  }
  const defaultKey: SouscriptionHolderKey =
    coupleSameFoyer && foyer ? `foyer:${foyer.id}` : `contact:${primary.id}`;
  return { options, defaultKey };
}

/** Le champ « Titulaire » n'apparaît que s'il y a un vrai choix. */
export function souscriptionHolderFieldVisible(choices: SouscriptionHolderChoices): boolean {
  return choices.options.length > 1;
}

export function souscriptionHolderKeyFromOperation(
  op: Pick<PlacementOperation, "holder_contact_id" | "holder_foyer_id">
): SouscriptionHolderKey | null {
  if (op.holder_contact_id != null && op.holder_contact_id > 0) {
    return `contact:${op.holder_contact_id}`;
  }
  if (op.holder_foyer_id != null && op.holder_foyer_id > 0) {
    return `foyer:${op.holder_foyer_id}`;
  }
  return null;
}

export function souscriptionHolderPayload(
  key: SouscriptionHolderKey | null
): Pick<PlacementSouscriptionDetails, "holder_contact_id" | "holder_foyer_id"> {
  if (!key) return { holder_contact_id: null, holder_foyer_id: null };
  const [kind, raw] = key.split(":");
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) return { holder_contact_id: null, holder_foyer_id: null };
  return kind === "foyer"
    ? { holder_contact_id: null, holder_foyer_id: id }
    : { holder_contact_id: id, holder_foyer_id: null };
}

/** Saisie VP / réinvestissement d'une souscription affaire. */
export interface SouscriptionExtrasValue {
  vpEnabled: boolean;
  /** Valeur brute MoneyInput (« 500.50 »). */
  vpMontantEuros: string;
  vpFrequence: string;
  /** % de réinvestissement (vide = aucun). */
  reinvestPct: string;
}

export const EMPTY_SOUSCRIPTION_EXTRAS: SouscriptionExtrasValue = {
  vpEnabled: false,
  vpMontantEuros: "",
  vpFrequence: "MENSUEL",
  reinvestPct: "",
};

export function souscriptionExtrasFromOperation(
  op: Pick<PlacementOperation, "vp_montant_centimes" | "vp_frequence" | "reinvest_dividendes_pct">
): SouscriptionExtrasValue {
  const vpEnabled = op.vp_montant_centimes != null && op.vp_montant_centimes > 0;
  return {
    vpEnabled,
    vpMontantEuros: vpEnabled ? String((op.vp_montant_centimes ?? 0) / 100) : "",
    vpFrequence: op.vp_frequence?.trim() || "MENSUEL",
    reinvestPct:
      op.reinvest_dividendes_pct != null && op.reinvest_dividendes_pct > 0
        ? String(op.reinvest_dividendes_pct)
        : "",
  };
}

export type SouscriptionExtrasPayload = Pick<
  PlacementSouscriptionDetails,
  "vp_montant_centimes" | "vp_frequence" | "reinvest_dividendes_pct"
>;

/**
 * Convertit la saisie en payload, en ne gardant que ce que le type de produit accepte
 * (mêmes règles que le formulaire investissement).
 */
export function souscriptionExtrasToPayload(
  value: SouscriptionExtrasValue,
  typeProduit: string | null | undefined
): { payload: SouscriptionExtrasPayload } | { error: string } {
  const payload: SouscriptionExtrasPayload = {
    vp_montant_centimes: null,
    vp_frequence: null,
    reinvest_dividendes_pct: null,
  };
  if (acceptsVersementProgramme(typeProduit) && value.vpEnabled) {
    const montant = parseMontantEurosToCentimes(value.vpMontantEuros);
    if (!montant) return { error: "Montant du versement programmé requis." };
    if (!FREQUENCE_VERSEMENT_LABELS[value.vpFrequence]) {
      return { error: "Fréquence du versement programmé requise." };
    }
    payload.vp_montant_centimes = montant;
    payload.vp_frequence = value.vpFrequence;
  }
  if (acceptsReinvestissementDividendes(typeProduit) && value.reinvestPct.trim()) {
    const pct = Number(value.reinvestPct.trim());
    if (!Number.isInteger(pct) || pct < 1 || pct > 100) {
      return { error: "Réinvestissement des dividendes : pourcentage entre 1 et 100." };
    }
    payload.reinvest_dividendes_pct = pct;
  }
  return { payload };
}

/** Souscription d'une affaire : seule opération qui crée un placement à la validation partenaire. */
export function placementOperationIsAffaireSouscription(
  op: Pick<PlacementOperation, "operation_type">,
  pipeType: string | null | undefined
): boolean {
  return pipeType === "AFFAIRE" && op.operation_type === "SOUSCRIPTION";
}

/** Souscription encore modifiable (non validée, non retirée). */
export function placementSouscriptionIsEditable(
  op: Pick<PlacementOperation, "operation_type" | "status" | "dismissed_at" | "investissement_id">,
  pipeType: string | null | undefined
): boolean {
  return (
    placementOperationIsAffaireSouscription(op, pipeType) &&
    op.status !== "CONFORME" &&
    !(op.dismissed_at != null && op.dismissed_at > 0) &&
    // Ancienne affaire Gagnée : placement déjà créé, à modifier dans le patrimoine.
    !(op.investissement_id != null && op.investissement_id > 0)
  );
}

export const SOUSCRIPTION_PLACEMENT_ALREADY_CREATED_MESSAGE =
  "Le placement a déjà été créé : modifiez-le dans le patrimoine";

export const SOUSCRIPTION_PLACEMENT_MISSING_MESSAGE =
  "Souscription validée, mais aucun placement n'a été créé. Vérifiez qu'il n'existe pas déjà dans le patrimoine du client.";

/** Souscription validée sans placement (échec de création auto ou validée avant cette version). */
export function placementSouscriptionNeedsManualPlacement(
  op: Pick<PlacementOperation, "operation_type" | "status" | "dismissed_at" | "investissement_id">,
  pipeType: string | null | undefined
): boolean {
  return (
    placementOperationIsAffaireSouscription(op, pipeType) &&
    op.status === "CONFORME" &&
    !(op.dismissed_at != null && op.dismissed_at > 0) &&
    !(op.investissement_id != null && op.investissement_id > 0)
  );
}

/** Clé de titulaire affichée : enregistrée si toujours proposée, sinon règle par défaut. */
export function resolveSouscriptionHolderKey(
  key: SouscriptionHolderKey | null,
  choices: SouscriptionHolderChoices | null
): SouscriptionHolderKey | null {
  if (!choices) return key;
  if (key && choices.options.some((o) => o.key === key)) return key;
  return choices.defaultKey;
}

/** Résumé court (titulaire / VP / réinvestissement) affiché sous l'acte. */
export function formatSouscriptionDetailsSummary(
  op: Pick<
    PlacementOperation,
    | "holder_contact_id"
    | "holder_foyer_id"
    | "vp_montant_centimes"
    | "vp_frequence"
    | "reinvest_dividendes_pct"
  >,
  choices: SouscriptionHolderChoices | null
): string {
  const parts: string[] = [];
  if (choices && souscriptionHolderFieldVisible(choices)) {
    const key = resolveSouscriptionHolderKey(souscriptionHolderKeyFromOperation(op), choices);
    const label = choices.options.find((o) => o.key === key)?.label;
    if (label) parts.push(`Titulaire : ${label}`);
  }
  if (op.vp_montant_centimes != null && op.vp_montant_centimes > 0) {
    const euros = (op.vp_montant_centimes / 100).toLocaleString("fr-FR", {
      maximumFractionDigits: 2,
    });
    const freq = FREQUENCE_VERSEMENT_LABELS[op.vp_frequence ?? ""]?.toLowerCase() ?? "";
    parts.push(`Versement programmé ${euros}\u00a0€${freq ? ` ${freq}` : ""}`);
  }
  if (op.reinvest_dividendes_pct != null && op.reinvest_dividendes_pct > 0) {
    parts.push(`Réinvestissement ${op.reinvest_dividendes_pct}\u00a0%`);
  }
  return parts.join(" · ");
}
