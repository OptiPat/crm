import type { Contact } from "@/lib/api/tauri-contacts";
import type { Investissement } from "@/lib/api/tauri-investissements";
import {
  computeAvPerVersementProgrammeCoverageStats,
  hasActiveVersementProgramme,
  isAvPerType,
} from "@/lib/investissements/investissement-versements";
import { isInvestissementActifEncours } from "@/lib/investissements/investissement-statut";
import {
  buildInvestissementIndexes,
  type InvestissementIndexes,
} from "./contact-client-panier-moyen-stats";
import { isContactEligibleForClientProductCoverageStats } from "./contact-client-product-coverage-stats";

export type ClientVpCoverageListKind = "withVp" | "withoutVp";

export type ClientVpCoverageStatResult = {
  /** Contrats AV/PER actifs « avec moi ». */
  totalCount: number;
  withVpCount: number;
  withoutVpCount: number;
  withVpPercent: number;
  /** Clients actifs ayant au moins un AV/PER éligible avec VP. */
  withVpContactIds: number[];
  /** Clients actifs ayant au moins un AV/PER éligible sans VP. */
  withoutVpContactIds: number[];
};

function contactInvestissements(
  contact: Contact,
  indexes: InvestissementIndexes
): Investissement[] {
  if (contact.id == null) return [];
  const personal = indexes.byContact[contact.id] ?? [];
  const foyer =
    contact.foyer_id != null
      ? (indexes.byFoyer[contact.foyer_id] ?? []).filter((inv) => inv.contact_id == null)
      : [];
  return [...personal, ...foyer];
}

/** Aligné page Investissements : AV/PER « avec moi », actif. */
export function isQualifyingAvPerForClientVpStats(
  inv: Pick<Investissement, "origine" | "type_produit" | "statut">
): boolean {
  return (
    inv.origine === "MON_CONSEIL" &&
    isInvestissementActifEncours(inv) &&
    isAvPerType(inv.type_produit)
  );
}

export function contactHasQualifyingAvPerWithVp(
  contact: Contact,
  indexes: InvestissementIndexes
): boolean {
  return contactInvestissements(contact, indexes).some(
    (inv) => isQualifyingAvPerForClientVpStats(inv) && hasActiveVersementProgramme(inv)
  );
}

export function contactHasQualifyingAvPerWithoutVp(
  contact: Contact,
  indexes: InvestissementIndexes
): boolean {
  return contactInvestissements(contact, indexes).some(
    (inv) => isQualifyingAvPerForClientVpStats(inv) && !hasActiveVersementProgramme(inv)
  );
}

/** KPI contrat — aligné `computeAvPerVersementProgrammeCoverageStats` (page Investissements). */
export function computeClientVpCoverageStats(
  contacts: Contact[],
  investissements: Investissement[]
): ClientVpCoverageStatResult {
  const coverage = computeAvPerVersementProgrammeCoverageStats(investissements);
  const indexes = buildInvestissementIndexes(investissements);
  const withVpContactIds: number[] = [];
  const withoutVpContactIds: number[] = [];

  for (const contact of contacts) {
    if (!isContactEligibleForClientProductCoverageStats(contact) || contact.id == null) continue;
    if (contactHasQualifyingAvPerWithVp(contact, indexes)) {
      withVpContactIds.push(contact.id);
    }
    if (contactHasQualifyingAvPerWithoutVp(contact, indexes)) {
      withoutVpContactIds.push(contact.id);
    }
  }

  return {
    totalCount: coverage.total,
    withVpCount: coverage.withVp,
    withoutVpCount: coverage.withoutVp,
    withVpPercent: coverage.percentWithVp ?? 0,
    withVpContactIds,
    withoutVpContactIds,
  };
}

export function filterContactsForClientVpCoverageList(
  contacts: Contact[],
  kind: ClientVpCoverageListKind,
  investissements: Investissement[]
): Contact[] {
  const indexes = buildInvestissementIndexes(investissements);
  return contacts.filter((contact) => {
    if (!isContactEligibleForClientProductCoverageStats(contact)) return false;
    return kind === "withVp"
      ? contactHasQualifyingAvPerWithVp(contact, indexes)
      : contactHasQualifyingAvPerWithoutVp(contact, indexes);
  });
}

/** Arrondi entier — aligné carte « Couverture VP » (Investissements). */
export function formatClientVpCoveragePercent(percent: number): string {
  return `${Math.round(percent)}\u00a0%`;
}

export function formatClientVpCoverageSubtitle(stats: ClientVpCoverageStatResult): string {
  return `${stats.withVpCount}/${stats.totalCount} avec VP`;
}
