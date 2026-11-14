import {
  EMPTY_VP_MODIFICATION_ACT_VALUE,
  type VpModificationActValue,
} from "@/lib/pdf/arbitrage-fiche-conseil/vp-modification-types";
import {
  EMPTY_VP_MISE_EN_PLACE_ACT_VALUE,
  type VpMiseEnPlaceActValue,
} from "@/lib/pdf/arbitrage-fiche-conseil/vp-mise-en-place-types";
import type { NouvelleSouscriptionDraft } from "@/lib/placement/nouvelle-souscription-inline";

/** Ligne « acte » du formulaire de création d'un Suivi (hors composant : Fast Refresh Vite). */
export interface SuiviStelliumActRow {
  key: string;
  productLabel: string;
  actLabel: string;
  montantEuros: string;
  vpModification: VpModificationActValue;
  vpMiseEnPlace: VpMiseEnPlaceActValue;
  /** Contrat mis à jour à la validation (versement, VP, arbitrage libre). */
  investissementId: number | null;
  /** Au moins un contrat éligible : le choix du contrat est obligatoire. */
  contractRequired: boolean;
  /** Acte « Nouvelle souscription » : souscriptions créées avec l'affaire enfant. */
  souscriptions: NouvelleSouscriptionDraft[];
}

export function newSuiviStelliumActRow(): SuiviStelliumActRow {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    productLabel: "",
    actLabel: "",
    montantEuros: "",
    vpModification: { ...EMPTY_VP_MODIFICATION_ACT_VALUE },
    vpMiseEnPlace: { ...EMPTY_VP_MISE_EN_PLACE_ACT_VALUE },
    investissementId: null,
    contractRequired: false,
    souscriptions: [],
  };
}

export function createInitialSuiviStelliumActs(): SuiviStelliumActRow[] {
  return [newSuiviStelliumActRow()];
}
