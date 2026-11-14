import {
  createPlacementOperation,
  notifyPlacementOperationsChanged,
} from "@/lib/api/tauri-box-placement";
import { createPipe, type PipeRecord } from "@/lib/api/tauri-pipe";
import {
  isStelliumLabelAllowedForProduct,
  placementOperationTypeFromStelliumLabel,
} from "@/lib/placement/stellium-box-placement-labels";
import { trackVersementAffaireOnPipeCreate } from "@/lib/placement/pipe-placement-tracking";
import {
  stelliumActUpdatesContract,
  vpFrequenceFromStelliumAct,
} from "@/lib/placement/placement-contract-link";
import { resolveInvestissementIdForStelliumAct } from "@/lib/placement/resolve-investissement-for-stellium-act";
import { isVpModificationStelliumAct, isVpMiseEnPlaceStelliumAct } from "@/lib/pdf/arbitrage-fiche-conseil/fiche-conseil-stellium";
import {
  vpMiseEnPlaceMontantCentimesFromAct,
  type VpMiseEnPlaceActValue,
} from "@/lib/pdf/arbitrage-fiche-conseil/vp-mise-en-place-types";
import {
  vpModificationMontantCentimesFromAct,
  type VpModificationActValue,
} from "@/lib/pdf/arbitrage-fiche-conseil/vp-modification-types";
import { parseMontantEurosToCentimes } from "@/lib/pipe/placement-montant";
import {
  buildNouvelleSouscriptionAffaireTitre,
  buildVersementAffaireTitre,
  defaultVersementComplementaireAffaireStage,
  isNouvelleSouscriptionActLabel,
  isVersementComplementaireActLabel,
} from "@/lib/pipe/pipe-suivi";

export interface SuiviStelliumActInput {
  productLabel: string;
  actLabel: string;
  montantCentimes?: number | null;
  investissementId?: number | null;
  /** Fréquence VP (mise en place / modification de périodicité) reportée sur le contrat. */
  vpFrequence?: string | null;
  /** Contrat à choisir (au moins un contrat éligible) pour un acte reporté sur la fiche. */
  contractRequired?: boolean;
}

/** Ligne de saisie formulaire (euros) — à mapper avant validation / persistance. */
export interface SuiviStelliumActFormRow {
  productLabel: string;
  actLabel: string;
  montantEuros: string;
  vpModification?: VpModificationActValue;
  vpMiseEnPlace?: VpMiseEnPlaceActValue;
  investissementId?: number | null;
  contractRequired?: boolean;
}

export function mapSuiviStelliumActRowToInput(
  row: SuiviStelliumActFormRow
): SuiviStelliumActInput {
  return {
    productLabel: row.productLabel,
    actLabel: row.actLabel,
    investissementId: row.investissementId ?? null,
    contractRequired: Boolean(row.contractRequired) && stelliumActUpdatesContract(row.actLabel),
    vpFrequence: vpFrequenceFromStelliumAct(row.actLabel, row.vpModification, row.vpMiseEnPlace),
    montantCentimes: isVpModificationStelliumAct(row.actLabel)
      ? vpModificationMontantCentimesFromAct(row.vpModification)
      : isVpMiseEnPlaceStelliumAct(row.actLabel)
        ? vpMiseEnPlaceMontantCentimesFromAct(row.vpMiseEnPlace)
        : parseMontantEurosToCentimes(row.montantEuros),
  };
}

export function mapSuiviStelliumActRowsToInputs(
  rows: SuiviStelliumActFormRow[]
): SuiviStelliumActInput[] {
  return rows.map(mapSuiviStelliumActRowToInput);
}

export function validateSuiviStelliumActInput(
  act: SuiviStelliumActInput
): string | null {
  const actLabel = act.actLabel.trim();
  if (!actLabel) return "Acte Stellium requis.";
  // Produit(s) et montants se saisissent ensuite sur l'affaire enfant (une ou plusieurs souscriptions).
  if (isNouvelleSouscriptionActLabel(actLabel)) return null;
  if (act.contractRequired && !(act.investissementId != null && act.investissementId > 0)) {
    return "Choisissez le contrat concerné (sa fiche sera mise à jour à la validation).";
  }
  if (isVersementComplementaireActLabel(actLabel)) {
    if (act.productLabel.trim() && !isStelliumLabelAllowedForProduct(actLabel, act.productLabel, { suivi: true })) {
      return "Versement complémentaire non applicable aux SCPI.";
    }
    if (!act.montantCentimes || act.montantCentimes <= 0) {
      return "Montant souscrit requis pour le versement complémentaire.";
    }
    return null;
  }
  const product = act.productLabel.trim();
  if (!product) return "Produit requis pour cet acte.";
  if (!isStelliumLabelAllowedForProduct(actLabel, product, { suivi: true })) {
    return "Acte incompatible avec le produit sélectionné.";
  }
  return null;
}

export function validateSuiviStelliumActs(acts: SuiviStelliumActInput[]): string | null {
  const filled = acts.filter((a) => a.actLabel.trim());
  if (filled.length === 0) return "Ajoutez au moins un acte Stellium.";
  for (const act of filled) {
    const err = validateSuiviStelliumActInput(act);
    if (err) return err;
  }
  return null;
}

export type SuiviVersementAffaireSource = Pick<
  PipeRecord,
  "id" | "contact_id" | "secondary_contact_id" | "contact_prenom" | "contact_nom" | "titre"
>;

export async function createVersementAffaireFromSuivi(
  suivi: SuiviVersementAffaireSource,
  options?: {
    productLabel?: string | null;
    montantCentimes?: number | null;
    investissementId?: number | null;
  }
): Promise<PipeRecord> {
  const child = await createPipe({
    contact_id: suivi.contact_id,
    secondary_contact_id: suivi.secondary_contact_id ?? null,
    pipe_type: "AFFAIRE",
    parent_pipe_id: suivi.id,
    titre: buildVersementAffaireTitre(suivi),
    stage: defaultVersementComplementaireAffaireStage(),
    notes: null,
  });
  await trackVersementAffaireOnPipeCreate(child, options);
  return child;
}

/** Affaire enfant « Nouvelle souscription » : hors R1→R3, souscriptions partenaire ajoutées ensuite. */
export async function createNouvelleSouscriptionAffaireFromSuivi(
  suivi: SuiviVersementAffaireSource
): Promise<PipeRecord> {
  return createPipe({
    contact_id: suivi.contact_id,
    secondary_contact_id: suivi.secondary_contact_id ?? null,
    pipe_type: "AFFAIRE",
    parent_pipe_id: suivi.id,
    titre: buildNouvelleSouscriptionAffaireTitre(suivi),
    stage: defaultVersementComplementaireAffaireStage(),
    notes: null,
  });
}

export async function applySuiviStelliumActsAfterPipeCreate(
  suivi: PipeRecord,
  acts: SuiviStelliumActInput[]
): Promise<PipeRecord[]> {
  const versementAffaires: PipeRecord[] = [];
  for (const act of acts) {
    const actLabel = act.actLabel.trim();
    if (!actLabel) continue;

    if (isNouvelleSouscriptionActLabel(actLabel)) {
      versementAffaires.push(await createNouvelleSouscriptionAffaireFromSuivi(suivi));
      continue;
    }

    if (isVersementComplementaireActLabel(actLabel)) {
      versementAffaires.push(
        await createVersementAffaireFromSuivi(suivi, {
          productLabel: act.productLabel.trim() || null,
          montantCentimes: act.montantCentimes ?? null,
          investissementId: act.investissementId ?? null,
        })
      );
      continue;
    }

    const product = act.productLabel.trim();
    const investissementId =
      act.investissementId ??
      (await resolveInvestissementIdForStelliumAct(suivi.contact_id, product));
    await createPlacementOperation({
      contact_id: suivi.contact_id,
      pipe_id: suivi.id,
      operation_type: placementOperationTypeFromStelliumLabel(actLabel),
      stellium_label: actLabel,
      product_label: product,
      investissement_id: investissementId,
      montant_centimes: isVpModificationStelliumAct(actLabel) || isVpMiseEnPlaceStelliumAct(actLabel)
        ? act.montantCentimes ?? null
        : null,
      vp_frequence: act.vpFrequence ?? null,
    });
  }
  notifyPlacementOperationsChanged();
  return versementAffaires;
}
