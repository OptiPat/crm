import type { Contact } from "@/lib/api/tauri-contacts";
import type { Investissement } from "@/lib/api/tauri-investissements";
import {
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
  totalCount: number;
  withReinvestCount: number;
  withReinvestPercent: number;
  withReinvestContactIds: number[];
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

export function contactHasQualifyingScpi(
  contact: Contact,
  indexes: InvestissementIndexes
): boolean {
  return contactInvestissements(contact, indexes).some(isQualifyingScpiForClientReinvestStats);
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

export function computeClientScpiReinvestStats(
  contacts: Contact[],
  investissements: Investissement[]
): ClientScpiReinvestStatResult {
  const indexes = buildInvestissementIndexes(investissements);
  const withReinvestContactIds: number[] = [];
  const withoutReinvestContactIds: number[] = [];

  for (const contact of contacts) {
    if (!isContactEligibleForClientProductCoverageStats(contact) || contact.id == null) continue;
    if (!contactHasQualifyingScpi(contact, indexes)) continue;
    if (contactHasScpiReinvestissementDividendes(contact, indexes)) {
      withReinvestContactIds.push(contact.id);
    } else {
      withoutReinvestContactIds.push(contact.id);
    }
  }

  const totalCount = withReinvestContactIds.length + withoutReinvestContactIds.length;
  const withReinvestCount = withReinvestContactIds.length;

  return {
    totalCount,
    withReinvestCount,
    withReinvestPercent: totalCount > 0 ? (withReinvestCount / totalCount) * 100 : 0,
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
    if (!contactHasQualifyingScpi(contact, indexes)) return false;
    const hasReinvest = contactHasScpiReinvestissementDividendes(contact, indexes);
    return kind === "withReinvest" ? hasReinvest : !hasReinvest;
  });
}

export function formatClientScpiReinvestPercent(percent: number): string {
  return `${percent.toFixed(1).replace(".0", "")} %`;
}

export function formatClientScpiReinvestSubtitle(stats: ClientScpiReinvestStatResult): string {
  return `${stats.withReinvestCount}/${stats.totalCount} clients avec SCPI`;
}
