import type { NewPlacementOperationInput } from "@/lib/api/tauri-box-placement";
import {
  AFFAIRE_STELLIUM_SOUSCRIPTION_LABEL,
  placementOperationTypeFromStelliumLabel,
} from "@/lib/placement/stellium-box-placement-labels";
import { parseMontantEurosToCentimes } from "@/lib/pipe/placement-montant";
import { inferTypeProduitFromStelliumProductLabel } from "@/lib/pipe/remuneration-type-produit";
import {
  EMPTY_SOUSCRIPTION_EXTRAS,
  souscriptionExtrasToPayload,
  souscriptionHolderPayload,
  type SouscriptionExtrasValue,
  type SouscriptionHolderKey,
} from "@/lib/placement/souscription-details";

/**
 * Souscription saisie directement à la création d'un Suivi (acte « Nouvelle souscription ») :
 * devient une « Souscription partenaire » de l'affaire enfant créée en même temps.
 */
export interface NouvelleSouscriptionDraft {
  key: string;
  productLabel: string;
  montantEuros: string;
  /** `null` = titulaire par défaut (contact principal). */
  holderKey: SouscriptionHolderKey | null;
  extras: SouscriptionExtrasValue;
}

export function newNouvelleSouscriptionDraft(): NouvelleSouscriptionDraft {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    productLabel: "",
    montantEuros: "",
    holderKey: null,
    extras: { ...EMPTY_SOUSCRIPTION_EXTRAS },
  };
}

function isEmptyDraft(draft: NouvelleSouscriptionDraft): boolean {
  return !draft.productLabel.trim() && !draft.montantEuros.trim();
}

/** Lignes vides ignorées ; une ligne entamée doit avoir produit et montant. */
export function validateNouvelleSouscriptionDrafts(
  drafts: readonly NouvelleSouscriptionDraft[] | undefined
): string | null {
  // Même produit plusieurs fois autorisé (ex. une AV pour soi, une pour son enfant) :
  // chaque ligne est créée à part (`force_new`).
  const filled = (drafts ?? []).filter((d) => !isEmptyDraft(d));
  for (const [index, draft] of filled.entries()) {
    const n = filled.length > 1 ? ` ${index + 1}` : "";
    if (!draft.productLabel.trim()) return `Souscription${n} : produit requis.`;
    if (!parseMontantEurosToCentimes(draft.montantEuros)) {
      return `Souscription${n} : montant souscrit requis.`;
    }
    const extras = souscriptionExtrasToPayload(
      draft.extras,
      inferTypeProduitFromStelliumProductLabel(draft.productLabel)
    );
    if ("error" in extras) return `Souscription${n} : ${extras.error}`;
  }
  return null;
}

/** Opérations « Souscription partenaire » (brouillons) de l'affaire enfant. */
export function buildNouvelleSouscriptionOperationInputs(
  drafts: readonly NouvelleSouscriptionDraft[] | undefined,
  target: { contactId: number; pipeId: number }
): NewPlacementOperationInput[] {
  return (drafts ?? [])
    .filter((d) => !isEmptyDraft(d))
    .map((draft) => {
      const product = draft.productLabel.trim();
      const typeProduit = inferTypeProduitFromStelliumProductLabel(product);
      const extras = souscriptionExtrasToPayload(draft.extras, typeProduit);
      return {
        contact_id: target.contactId,
        pipe_id: target.pipeId,
        operation_type: placementOperationTypeFromStelliumLabel(AFFAIRE_STELLIUM_SOUSCRIPTION_LABEL),
        stellium_label: AFFAIRE_STELLIUM_SOUSCRIPTION_LABEL,
        product_label: product,
        montant_centimes: parseMontantEurosToCentimes(draft.montantEuros),
        type_produit: typeProduit,
        ...("payload" in extras ? extras.payload : {}),
        ...souscriptionHolderPayload(draft.holderKey),
        force_new: true,
      };
    });
}
