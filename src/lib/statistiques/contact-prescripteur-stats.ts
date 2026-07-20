import type { Contact } from "@/lib/api/tauri-contacts";
import type { Investissement } from "@/lib/api/tauri-investissements";
import {
  contactHasSignedAsFilleulParrain,
  contactHasSignedAvecMoi,
  isContactEligibleForClientSourceLeadStats,
  isContactEligibleForFilleulSourceLeadStats,
  resolveSourceLeadAttributionContactId,
  type ContactSourceLeadInvestissementStatRow,
  type ContactSourceLeadStatRow,
  type ContactSourceLeadStatsOptions,
  type SourceLeadStatsLens,
} from "./contact-source-stats";

/** Clé interne pour les contacts sans prescripteur renseigné. */
export const CONTACT_PRESCRIPTEUR_UNSET_KEY = "__NO_PRESCRIPTEUR__";

export const CONTACT_PRESCRIPTEUR_UNSET_LABEL = "Non renseigné";

function isContactEligibleForLens(
  contact: Contact,
  options: ContactSourceLeadStatsOptions | undefined,
  lens: SourceLeadStatsLens
): boolean {
  return lens === "client"
    ? isContactEligibleForClientSourceLeadStats(contact)
    : isContactEligibleForFilleulSourceLeadStats(contact, options);
}

function contactCountsAsSignedForLens(
  contact: Contact,
  investissements: Investissement[],
  options: ContactSourceLeadStatsOptions | undefined,
  lens: SourceLeadStatsLens
): boolean {
  if (lens === "client") {
    return contactHasSignedAvecMoi(contact, investissements);
  }
  return contactHasSignedAsFilleulParrain(contact, options?.selfContactId);
}

export function prescripteurGroupKeyFromContact(contact: Pick<Contact, "prescripteur_id">): string {
  if (contact.prescripteur_id == null) return CONTACT_PRESCRIPTEUR_UNSET_KEY;
  return `prescripteur:${contact.prescripteur_id}`;
}

export function contactPrescripteurDisplayLabel(key: string, contacts: Contact[]): string {
  if (key === CONTACT_PRESCRIPTEUR_UNSET_KEY) return CONTACT_PRESCRIPTEUR_UNSET_LABEL;
  const id = Number(key.replace(/^prescripteur:/, ""));
  if (!Number.isFinite(id)) return "Prescripteur inconnu";
  const prescripteur = contacts.find((c) => c.id === id);
  if (!prescripteur) return "Prescripteur inconnu";
  const name = [prescripteur.prenom, prescripteur.nom].filter(Boolean).join(" ").trim();
  return name || "Prescripteur";
}

function prescripteurRowFromContact(
  contact: Contact,
  contacts: Contact[]
): { key: string; label: string } {
  const key = prescripteurGroupKeyFromContact(contact);
  return { key, label: contactPrescripteurDisplayLabel(key, contacts) };
}

function sortPrescripteurRows<T extends { key: string; count: number; label: string }>(
  rows: T[]
): T[] {
  return rows.sort((a, b) => {
    if (a.key === CONTACT_PRESCRIPTEUR_UNSET_KEY) return 1;
    if (b.key === CONTACT_PRESCRIPTEUR_UNSET_KEY) return -1;
    return b.count - a.count || a.label.localeCompare(b.label, "fr");
  });
}

export function computeContactPrescripteurStats(
  contacts: Contact[],
  options?: ContactSourceLeadStatsOptions,
  lens: SourceLeadStatsLens = "client"
): { total: number; rows: ContactSourceLeadStatRow[] } {
  const eligible = contacts.filter((contact) => isContactEligibleForLens(contact, options, lens));
  const total = eligible.length;
  if (total === 0) {
    return { total: 0, rows: [] };
  }

  const groups = new Map<string, { label: string; contactIds: number[] }>();

  for (const contact of eligible) {
    const { key: groupKey, label } = prescripteurRowFromContact(contact, contacts);
    const existing = groups.get(groupKey);
    if (existing) {
      existing.contactIds.push(contact.id);
      continue;
    }
    groups.set(groupKey, { label, contactIds: [contact.id] });
  }

  const rows: ContactSourceLeadStatRow[] = sortPrescripteurRows(
    [...groups.entries()].map(([key, group]) => ({
      key,
      label: group.label,
      count: group.contactIds.length,
      percent: (group.contactIds.length / total) * 100,
      contactIds: group.contactIds,
    }))
  );

  return { total, rows };
}

export function filterContactsByPrescripteurKey(
  contacts: Contact[],
  key: string,
  options?: ContactSourceLeadStatsOptions,
  lens: SourceLeadStatsLens = "client"
): Contact[] {
  return contacts
    .filter((contact) => isContactEligibleForLens(contact, options, lens))
    .filter((contact) => prescripteurGroupKeyFromContact(contact) === key);
}

export function computeContactPrescripteurConversionStats(
  contacts: Contact[],
  investissements: Investissement[],
  options?: ContactSourceLeadStatsOptions,
  lens: SourceLeadStatsLens = "client"
): { total: number; totalMontantCentimes: number; rows: ContactSourceLeadInvestissementStatRow[] } {
  const contactStats = computeContactPrescripteurStats(contacts, options, lens);
  if (contactStats.total === 0) {
    return { total: 0, totalMontantCentimes: 0, rows: [] };
  }

  const eligibleById = new Map(
    contacts
      .filter((contact) => isContactEligibleForLens(contact, options, lens))
      .filter((contact) => contact.id != null)
      .map((contact) => [contact.id!, contact])
  );

  const signedContactIds = new Set<number>();
  for (const contact of eligibleById.values()) {
    if (contactCountsAsSignedForLens(contact, investissements, options, lens)) {
      signedContactIds.add(contact.id);
    }
  }

  const investmentGroups = new Map<
    string,
    {
      investissementIds: number[];
      montantCentimes: number;
    }
  >();
  let total = 0;
  let totalMontantCentimes = 0;

  if (lens === "client") {
    for (const inv of investissements) {
      const contactId = resolveSourceLeadAttributionContactId(inv, contacts, options);
      if (contactId == null) continue;

      const contact = contacts.find((c) => c.id === contactId);
      if (!contact) continue;

      const { key: groupKey } = prescripteurRowFromContact(contact, contacts);
      const montant = inv.montant_initial ?? 0;
      total += 1;
      totalMontantCentimes += montant;

      const existing = investmentGroups.get(groupKey);
      if (existing) {
        existing.investissementIds.push(inv.id);
        existing.montantCentimes += montant;
        continue;
      }
      investmentGroups.set(groupKey, {
        investissementIds: [inv.id],
        montantCentimes: montant,
      });
    }
  }

  const rows: ContactSourceLeadInvestissementStatRow[] = contactStats.rows
    .map((contactRow) => {
      const investmentGroup = investmentGroups.get(contactRow.key);
      const signedContactCount = contactRow.contactIds.filter((id) =>
        signedContactIds.has(id)
      ).length;
      const supportCount = investmentGroup?.investissementIds.length ?? 0;
      return {
        key: contactRow.key,
        label: contactRow.label,
        contactCount: contactRow.count,
        signedContactCount,
        conversionPercent:
          contactRow.count > 0 ? (signedContactCount / contactRow.count) * 100 : 0,
        count: supportCount,
        montantCentimes: investmentGroup?.montantCentimes ?? 0,
        percent: total > 0 ? (supportCount / total) * 100 : 0,
        investissementIds: investmentGroup?.investissementIds ?? [],
        contactIds: contactRow.contactIds,
      };
    })
    .sort((a, b) => {
      if (a.key === CONTACT_PRESCRIPTEUR_UNSET_KEY) return 1;
      if (b.key === CONTACT_PRESCRIPTEUR_UNSET_KEY) return -1;
      if (lens === "client") {
        return (
          b.montantCentimes - a.montantCentimes ||
          b.conversionPercent - a.conversionPercent ||
          b.signedContactCount - a.signedContactCount ||
          b.count - a.count ||
          a.label.localeCompare(b.label, "fr")
        );
      }
      return (
        b.conversionPercent - a.conversionPercent ||
        b.signedContactCount - a.signedContactCount ||
        b.contactCount - a.contactCount ||
        a.label.localeCompare(b.label, "fr")
      );
    });

  return { total, totalMontantCentimes, rows };
}

export function filterInvestissementsByPrescripteurKey(
  contacts: Contact[],
  investissements: Investissement[],
  key: string,
  options?: ContactSourceLeadStatsOptions
): Investissement[] {
  return investissements.filter((inv) => {
    const contactId = resolveSourceLeadAttributionContactId(inv, contacts, options);
    if (contactId == null) return false;
    const contact = contacts.find((c) => c.id === contactId);
    if (!contact) return false;
    return prescripteurGroupKeyFromContact(contact) === key;
  });
}
