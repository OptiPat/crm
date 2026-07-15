import { effectivePvForRemuneration } from "@/lib/pipe/remuneration-pv";

export const REMUNERATION_TPC_OPTIONS = [3, 5, 6, 6.5, 7, 7.5, 8] as const;

export type RemunerationTpcPercent = (typeof REMUNERATION_TPC_OPTIONS)[number];

/** Rémunération en centimes : montant × PV × TPC(%). */
export function computeRemunerationCentimes(options: {
  montantCentimes: number;
  typeProduit: string;
  tpcPercent: number;
  cifEnabled: boolean;
  pvManual?: number | null;
}): number | null {
  const { montantCentimes, typeProduit, tpcPercent, cifEnabled, pvManual } = options;
  if (!Number.isFinite(montantCentimes) || montantCentimes <= 0) return null;
  if (!Number.isFinite(tpcPercent) || tpcPercent <= 0) return null;
  const pv = effectivePvForRemuneration({ typeProduit, cifEnabled, pvManual });
  if (pv == null || !Number.isFinite(pv) || pv <= 0) return null;
  return Math.round((montantCentimes * pv * tpcPercent) / 100);
}
