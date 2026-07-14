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
  buildVersementAffaireTitre,
  defaultVersementComplementaireAffaireStage,
  isVersementComplementaireActLabel,
} from "@/lib/pipe/pipe-suivi";

export interface SuiviStelliumActInput {
  productLabel: string;
  actLabel: string;
}

export function validateSuiviStelliumActInput(
  act: SuiviStelliumActInput
): string | null {
  const actLabel = act.actLabel.trim();
  if (!actLabel) return "Acte Stellium requis.";
  if (isVersementComplementaireActLabel(actLabel)) return null;
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
  options?: { productLabel?: string | null }
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

export async function applySuiviStelliumActsAfterPipeCreate(
  suivi: PipeRecord,
  acts: SuiviStelliumActInput[]
): Promise<PipeRecord[]> {
  const versementAffaires: PipeRecord[] = [];
  for (const act of acts) {
    const actLabel = act.actLabel.trim();
    if (!actLabel) continue;

    if (isVersementComplementaireActLabel(actLabel)) {
      versementAffaires.push(
        await createVersementAffaireFromSuivi(suivi, {
          productLabel: act.productLabel.trim() || null,
        })
      );
      continue;
    }

    const product = act.productLabel.trim();
    await createPlacementOperation({
      contact_id: suivi.contact_id,
      pipe_id: suivi.id,
      operation_type: placementOperationTypeFromStelliumLabel(actLabel),
      stellium_label: actLabel,
      product_label: product,
    });
  }
  notifyPlacementOperationsChanged();
  return versementAffaires;
}
