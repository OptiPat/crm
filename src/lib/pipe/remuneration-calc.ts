import { effectivePvForRemuneration } from "@/lib/pipe/remuneration-pv";
import { remunerationFraisDeduitsPct } from "@/lib/pipe/remuneration-scpi-frais";

export const REMUNERATION_TPC_OPTIONS = [3, 5, 6, 6.5, 7, 7.5, 8] as const;

export type RemunerationTpcPercent = (typeof REMUNERATION_TPC_OPTIONS)[number];

/**
 * Rémunération en centimes : assiette × PV × TPC(%).
 * Assiette = montant vendu, moins les frais de souscription pour une SCPI
 * (AV / PER / capitalisation : montant × 0,4 × TPC ;
 *  SCPI : (montant − frais) × PV × TPC, PV 0,5 en CIF, 0,4 sinon).
 */
export function computeRemunerationCentimes(options: {
  montantCentimes: number;
  typeProduit: string;
  tpcPercent: number;
  cifEnabled: boolean;
  pvManual?: number | null;
  /** Produit vendu : taux de frais de la fiche SCPI. */
  productLabel?: string | null;
}): number | null {
  const { montantCentimes, typeProduit, tpcPercent, cifEnabled, pvManual, productLabel } = options;
  if (!Number.isFinite(montantCentimes) || montantCentimes <= 0) return null;
  if (!Number.isFinite(tpcPercent) || tpcPercent <= 0) return null;
  const pv = effectivePvForRemuneration({ typeProduit, cifEnabled, pvManual });
  if (pv == null || !Number.isFinite(pv) || pv <= 0) return null;
  const fraisPct = remunerationFraisDeduitsPct({ typeProduit, productLabel }) ?? 0;
  const assiette = montantCentimes * (1 - fraisPct / 100);
  return Math.round((assiette * pv * tpcPercent) / 100);
}
