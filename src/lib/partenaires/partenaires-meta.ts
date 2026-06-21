import type { Investissement } from "@/lib/api/tauri-investissements";
import type { PartenaireListMeta } from "@/components/partenaires/PartenaireSummaryCard";
import { getEffectiveEncoursCentimes } from "@/lib/investissements/investissement-encours";

export function partenaireEncoursContribution(inv: Investissement): number {
  if (inv.origine !== "MON_CONSEIL") return 0;
  return getEffectiveEncoursCentimes(inv);
}

export function indexInvestissementsByPartenaire(
  investissements: Investissement[]
): Record<number, Investissement[]> {
  const byPartenaireId: Record<number, Investissement[]> = {};
  for (const inv of investissements) {
    if (inv.partenaire_id == null) continue;
    if (!byPartenaireId[inv.partenaire_id]) {
      byPartenaireId[inv.partenaire_id] = [];
    }
    byPartenaireId[inv.partenaire_id].push(inv);
  }
  for (const id of Object.keys(byPartenaireId)) {
    byPartenaireId[Number(id)].sort(
      (a, b) => partenaireEncoursContribution(b) - partenaireEncoursContribution(a)
    );
  }
  return byPartenaireId;
}

export function buildMetaParPartenaireId(
  investissements: Investissement[]
): Record<number, PartenaireListMeta> {
  const meta: Record<number, PartenaireListMeta> = {};
  for (const inv of investissements) {
    if (inv.partenaire_id == null) continue;
    if (!meta[inv.partenaire_id]) {
      meta[inv.partenaire_id] = { investissementCount: 0, encoursAvecMoi: 0 };
    }
    meta[inv.partenaire_id].investissementCount += 1;
    meta[inv.partenaire_id].encoursAvecMoi += partenaireEncoursContribution(inv);
  }
  return meta;
}

export function countProduitsLies(investissements: Investissement[]): number {
  return investissements.filter((inv) => inv.partenaire_id != null).length;
}
