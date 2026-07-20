import type { Contact } from "@/lib/api/tauri-contacts";
import type { Investissement } from "@/lib/api/tauri-investissements";
import { isContactEligibleForClientProductCoverageStats } from "./contact-client-product-coverage-stats";

export type ClientAbovePanierMoyenListKind = "above" | "atOrBelow";

export type ClientAbovePanierMoyenStatResult = {
  panierMoyenEuros: number;
  totalCount: number;
  aboveCount: number;
  abovePercent: number;
  aboveContactIds: number[];
  atOrBelowContactIds: number[];
};

export type InvestissementIndexes = {
  byContact: Record<number, Investissement[]>;
  byFoyer: Record<number, Investissement[]>;
};

export function buildInvestissementIndexes(investissements: Investissement[]): InvestissementIndexes {
  const byContact: Record<number, Investissement[]> = {};
  const byFoyer: Record<number, Investissement[]> = {};

  for (const inv of investissements) {
    if (inv.contact_id != null) {
      (byContact[inv.contact_id] ??= []).push(inv);
    }
    if (inv.foyer_id != null) {
      (byFoyer[inv.foyer_id] ??= []).push(inv);
    }
  }

  return { byContact, byFoyer };
}

/** Clients actifs éligibles par foyer — dénominateur pour la part commune. */
export function buildActiveClientCountByFoyer(contacts: Contact[]): Record<number, number> {
  const counts: Record<number, number> = {};
  for (const contact of contacts) {
    if (!isContactEligibleForClientProductCoverageStats(contact) || contact.foyer_id == null) continue;
    counts[contact.foyer_id] = (counts[contact.foyer_id] ?? 0) + 1;
  }
  return counts;
}

export function buildActiveClientIdSet(contacts: Contact[]): Set<number> {
  const ids = new Set<number>();
  for (const contact of contacts) {
    if (isContactEligibleForClientProductCoverageStats(contact) && contact.id != null) {
      ids.add(contact.id);
    }
  }
  return ids;
}

function foyerInvestissementsForPanierPool(
  foyerInvestissements: Investissement[],
  activeClientIds: Set<number>
): Investissement[] {
  return foyerInvestissements.filter(
    (inv) => inv.contact_id == null || activeClientIds.has(inv.contact_id)
  );
}

function sumMontantInitialAvecMoiCentimes(
  investissements: Pick<Investissement, "origine" | "montant_initial">[]
): number {
  return investissements
    .filter((inv) => inv.origine === "MON_CONSEIL")
    .reduce((sum, inv) => sum + (inv.montant_initial || 0), 0);
}

/**
 * Montant souscrit « avec moi » pour la stat panier :
 * - perso hors foyer (contact seul, sans foyer_id)
 * - + pool foyer (tous placements du foyer, y compris rattachés à un déclarant) ÷ nb clients actifs
 */
export function contactMontantSouscritAvecMoiEuros(
  contact: Contact,
  indexes: InvestissementIndexes,
  activeClientCountByFoyer: Record<number, number>,
  activeClientIds: Set<number>
): number {
  if (contact.id == null) return 0;

  const contactInvs = indexes.byContact[contact.id] ?? [];
  const purePersoCentimes = sumMontantInitialAvecMoiCentimes(
    contactInvs.filter((inv) => inv.foyer_id == null)
  );

  if (contact.foyer_id == null) {
    return purePersoCentimes / 100;
  }

  const foyerInvs = foyerInvestissementsForPanierPool(
    indexes.byFoyer[contact.foyer_id] ?? [],
    activeClientIds
  );
  const foyerPoolCentimes = sumMontantInitialAvecMoiCentimes(foyerInvs);
  const memberCount = activeClientCountByFoyer[contact.foyer_id] ?? 1;

  return purePersoCentimes / 100 + foyerPoolCentimes / 100 / memberCount;
}

export function contactExceedsPanierMoyen(
  contact: Contact,
  indexes: InvestissementIndexes,
  panierMoyenEuros: number,
  activeClientCountByFoyer: Record<number, number>,
  activeClientIds: Set<number>
): boolean {
  return (
    contactMontantSouscritAvecMoiEuros(
      contact,
      indexes,
      activeClientCountByFoyer,
      activeClientIds
    ) > panierMoyenEuros
  );
}

export function computeClientAbovePanierMoyenStats(
  contacts: Contact[],
  investissements: Investissement[],
  panierMoyenEuros: number
): ClientAbovePanierMoyenStatResult {
  const indexes = buildInvestissementIndexes(investissements);
  const activeClientCountByFoyer = buildActiveClientCountByFoyer(contacts);
  const activeClientIds = buildActiveClientIdSet(contacts);
  const aboveContactIds: number[] = [];
  const atOrBelowContactIds: number[] = [];

  for (const contact of contacts) {
    if (!isContactEligibleForClientProductCoverageStats(contact) || contact.id == null) continue;
    if (contactExceedsPanierMoyen(
      contact,
      indexes,
      panierMoyenEuros,
      activeClientCountByFoyer,
      activeClientIds
    )) {
      aboveContactIds.push(contact.id);
    } else {
      atOrBelowContactIds.push(contact.id);
    }
  }

  const totalCount = aboveContactIds.length + atOrBelowContactIds.length;
  const aboveCount = aboveContactIds.length;

  return {
    panierMoyenEuros,
    totalCount,
    aboveCount,
    abovePercent: totalCount > 0 ? (aboveCount / totalCount) * 100 : 0,
    aboveContactIds,
    atOrBelowContactIds,
  };
}

export function filterContactsForClientAbovePanierMoyenList(
  contacts: Contact[],
  kind: ClientAbovePanierMoyenListKind,
  investissements: Investissement[],
  panierMoyenEuros: number
): Contact[] {
  const indexes = buildInvestissementIndexes(investissements);
  const activeClientCountByFoyer = buildActiveClientCountByFoyer(contacts);
  const activeClientIds = buildActiveClientIdSet(contacts);
  return contacts.filter((contact) => {
    if (!isContactEligibleForClientProductCoverageStats(contact)) return false;
    const exceeds = contactExceedsPanierMoyen(
      contact,
      indexes,
      panierMoyenEuros,
      activeClientCountByFoyer,
      activeClientIds
    );
    return kind === "above" ? exceeds : !exceeds;
  });
}

export function formatClientAbovePanierMoyenPercent(percent: number): string {
  return `${percent.toFixed(1).replace(".0", "")} %`;
}

export function formatClientAbovePanierMoyenSubtitle(stats: ClientAbovePanierMoyenStatResult): string {
  return `${stats.aboveCount}/${stats.totalCount} clients actifs`;
}
