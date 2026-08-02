import { parseMontantEurosToCentimes } from "@/lib/pipe/placement-montant";

export type VpMiseEnPlaceActValue = {
  montantEuros: string;
  /** Fréquence CRM : MENSUEL, TRIMESTRIEL, SEMESTRIEL, ANNUEL */
  frequence: string;
};

export const EMPTY_VP_MISE_EN_PLACE_ACT_VALUE: VpMiseEnPlaceActValue = {
  montantEuros: "",
  frequence: "MENSUEL",
};

export type VpMiseEnPlacePdfFillInput = {
  montantCentimes?: number | null;
  frequence?: string | null;
};

export function vpMiseEnPlaceMontantCentimesFromAct(
  value: VpMiseEnPlaceActValue | undefined
): number | null {
  if (!value?.montantEuros.trim()) return null;
  return parseMontantEurosToCentimes(value.montantEuros);
}

export function toVpMiseEnPlacePdfFillInput(
  value: VpMiseEnPlaceActValue
): VpMiseEnPlacePdfFillInput | undefined {
  const montantCentimes = vpMiseEnPlaceMontantCentimesFromAct(value);
  if (montantCentimes == null || montantCentimes <= 0) return undefined;
  return {
    montantCentimes,
    frequence: value.frequence || null,
  };
}
