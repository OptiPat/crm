import type { Contact } from "@/lib/api/tauri-contacts";
import type { Investissement } from "@/lib/api/tauri-investissements";
import {
  computeScpiReinvestissementCoverageStats,
  hasActiveReinvestissementDividendes,
  isScpiPleineProprieteType,
} from "@/lib/investissements/investissement-scpi-reinvest";
import { isInvestissementActifEncours } from "@/lib/investissements/investissement-statut";
import {
  buildInvestissementIndexes,
  type InvestissementIndexes,
} from "./contact-client-panier-moyen-stats";
import { isContactEligibleForClientProductCoverageStats } from "./contact-client-product-coverage-stats";

export type ClientScpiReinvestListKind = "withReinvest" | "withoutReinvest";

export type ClientScpiReinvestStatResult = {
  /** SCPI pleine propriété actives « avec moi » (contrats). */
  totalCount: number;
  withReinvestCount: number;
  withoutReinvestCount: number;
  withReinvestPercent: number;
  /** Clients actifs ayant au moins une SCPI éligible avec réinvestissement. */
  withReinvestContactIds: number[];
  /** Clients actifs ayant au moins une SCPI éligible sans réinvestissement. */
  withoutReinvestContactIds: number[];
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

/** Aligné page Investissements : SCPI pleine propriété « avec moi », actif. */
export function isQualifyingScpiForClientReinvestStats(
  inv: Pick<Investissement, "origine" | "type_produit" | "statut">
): boolean {
  return (
    inv.origine === "MON_CONSEIL" &&
    isInvestissementActifEncours(inv) &&
    isScpiPleineProprieteType(inv.type_produit)
  );
}

export function contactHasQualifyingScpiWithoutReinvest(
  contact: Contact,
  indexes: InvestissementIndexes
): boolean {
  return contactInvestissements(contact, indexes).some(
    (inv) =>
      isQualifyingScpiForClientReinvestStats(inv) && !hasActiveReinvestissementDividendes(inv)
  );
}

export function contactHasScpiReinvestissementDividendes(
  contact: Contact,
  indexes: InvestissementIndexes
): boolean {
  return contactInvestissements(contact, indexes).some(
    (inv) =>
      isQualifyingScpiForClientReinvestStats(inv) && hasActiveReinvestissementDividendes(inv)
  );
}

/** KPI contrat — aligné `computeScpiReinvestissementCoverageStats` (page Investissements). */
export function computeClientScpiReinvestStats(
  contacts: Contact[],
  investissements: Investissement[]
): ClientScpiReinvestStatResult {
  const coverage = computeScpiReinvestissementCoverageStats(investissements);
  const indexes = buildInvestissementIndexes(investissements);
  const withReinvestContactIds: number[] = [];
  const withoutReinvestContactIds: number[] = [];

  for (const contact of contacts) {
    if (!isContactEligibleForClientProductCoverageStats(contact) || contact.id == null) continue;
    if (contactHasScpiReinvestissementDividendes(contact, indexes)) {
      withReinvestContactIds.push(contact.id);
    }
    if (contactHasQualifyingScpiWithoutReinvest(contact, indexes)) {
      withoutReinvestContactIds.push(contact.id);
    }
  }

  return {
    totalCount: coverage.total,
    withReinvestCount: coverage.withReinvest,
    withoutReinvestCount: coverage.withoutReinvest,
    withReinvestPercent: coverage.percentWithReinvest ?? 0,
    withReinvestContactIds,
    withoutReinvestContactIds,
  };
}

export function filterContactsForClientScpiReinvestList(
  contacts: Contact[],
  kind: ClientScpiReinvestListKind,
  investissements: Investissement[]
): Contact[] {
  const indexes = buildInvestissementIndexes(investissements);
  return contacts.filter((contact) => {
    if (!isContactEligibleForClientProductCoverageStats(contact)) return false;
    return kind === "withReinvest"
      ? contactHasScpiReinvestissementDividendes(contact, indexes)
      : contactHasQualifyingScpiWithoutReinvest(contact, indexes);
  });
}

/** Arrondi entier — aligné carte « Réinv. dividendes » (Investissements). */
export function formatClientScpiReinvestPercent(percent: number): string {
  return `${Math.round(percent)}\u00a0%`;
}

export function formatClientScpiReinvestSubtitle(stats: ClientScpiReinvestStatResult): string {
  return `${stats.withReinvestCount}/${stats.totalCount} avec réinv.`;
}
