import { versementProgrammeMensuelCentimes } from "@/lib/investissements/investissement-versements";
import {
  isAvPerVersementProgrammeKpiInvestissement,
  isScpiVersementProgrammeKpiInvestissement,
} from "@/lib/dashboard/dashboard-versements-kpi";

type VpMoyenInvestissement = {
  id?: number;
  origine?: string;
  statut?: string;
  type_produit?: string;
  versement_programme?: boolean;
  montant_versement_programme?: number | null;
  frequence_versement?: string | null;
  contact_id?: number | null;
  foyer_id?: number | null;
};

export type ClientVpMoyenBucketStats = {
  count: number;
  totalMensuelCentimes: number;
  /** Moyenne mensuelle par VP, en euros. Null si aucun VP éligible. */
  moyenMensuelEuros: number | null;
};

export type ClientVpMoyenMensuelStats = {
  avPer: ClientVpMoyenBucketStats;
  scpi: ClientVpMoyenBucketStats;
};

function finishBucket(totalMensuelCentimes: number, count: number): ClientVpMoyenBucketStats {
  return {
    count,
    totalMensuelCentimes,
    moyenMensuelEuros: count > 0 ? totalMensuelCentimes / count / 100 : null,
  };
}

/** Moyenne mensuelle par VP — AV/PER et SCPI séparés, « avec moi », actifs. */
export function computeClientVpMoyenMensuelStats(
  investissements: VpMoyenInvestissement[]
): ClientVpMoyenMensuelStats {
  const seenIds = new Set<number>();
  let avPerTotal = 0;
  let avPerCount = 0;
  let scpiTotal = 0;
  let scpiCount = 0;

  for (const inv of investissements) {
    if (inv.id != null) {
      if (seenIds.has(inv.id)) continue;
      seenIds.add(inv.id);
    }
    const montant = inv.montant_versement_programme ?? 0;
    const mensuel = versementProgrammeMensuelCentimes(montant, inv.frequence_versement);
    if (isAvPerVersementProgrammeKpiInvestissement(inv)) {
      avPerTotal += mensuel;
      avPerCount += 1;
      continue;
    }
    if (isScpiVersementProgrammeKpiInvestissement(inv)) {
      scpiTotal += mensuel;
      scpiCount += 1;
    }
  }

  return {
    avPer: finishBucket(avPerTotal, avPerCount),
    scpi: finishBucket(scpiTotal, scpiCount),
  };
}
