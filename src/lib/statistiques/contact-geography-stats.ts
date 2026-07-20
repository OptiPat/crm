import type { Contact } from "@/lib/api/tauri-contacts";
import {
  GEOGRAPHY_FOREIGN_KEY,
  GEOGRAPHY_UNSET_KEY,
  geographyGroupKeyFromContact,
  geographyGroupLabel,
  geographyGroupLabelFromContact,
  isForeignCountryGeographyKey,
} from "@/lib/contacts/departement-from-code-postal";
import {
  isContactEligibleForStatsLens,
  type ContactStatsLens,
} from "./contact-stats-lenses";

export type GeographyLens = ContactStatsLens;

export type ContactGeographyStatRow = {
  key: string;
  label: string;
  count: number;
  percent: number;
  contactIds: number[];
};

function sortGeographyRows(rows: ContactGeographyStatRow[]): ContactGeographyStatRow[] {
  return rows.sort((a, b) => {
    if (a.key === GEOGRAPHY_UNSET_KEY) return 1;
    if (b.key === GEOGRAPHY_UNSET_KEY) return -1;
    if (a.key === GEOGRAPHY_FOREIGN_KEY) return 1;
    if (b.key === GEOGRAPHY_FOREIGN_KEY) return -1;
    const aForeign = isForeignCountryGeographyKey(a.key);
    const bForeign = isForeignCountryGeographyKey(b.key);
    if (aForeign && !bForeign) return 1;
    if (!aForeign && bForeign) return -1;
    return b.count - a.count || a.label.localeCompare(b.label, "fr");
  });
}

export function computeContactGeographyStats(
  contacts: Contact[],
  lens: GeographyLens
): { total: number; rows: ContactGeographyStatRow[] } {
  const eligible = contacts.filter(
    (contact) => contact.id != null && isContactEligibleForStatsLens(contact, lens)
  );
  const total = eligible.length;
  if (total === 0) {
    return { total: 0, rows: [] };
  }

  const buckets = new Map<string, { contactIds: number[]; label?: string }>();

  for (const contact of eligible) {
    const key = geographyGroupKeyFromContact(contact);
    const existing = buckets.get(key) ?? { contactIds: [] };
    existing.contactIds.push(contact.id!);
    if (isForeignCountryGeographyKey(key)) {
      existing.label = geographyGroupLabelFromContact(contact);
    }
    buckets.set(key, existing);
  }

  const rows: ContactGeographyStatRow[] = [...buckets.entries()].map(([key, bucket]) => ({
    key,
    label: bucket.label ?? geographyGroupLabel(key),
    count: bucket.contactIds.length,
    percent: (bucket.contactIds.length / total) * 100,
    contactIds: bucket.contactIds,
  }));

  return { total, rows: sortGeographyRows(rows) };
}

export function filterContactsByGeographyKey(
  contacts: Contact[],
  lens: GeographyLens,
  key: string
): Contact[] {
  return contacts.filter((contact) => {
    if (!isContactEligibleForStatsLens(contact, lens)) return false;
    return geographyGroupKeyFromContact(contact) === key;
  });
}

export {
  isContactEligibleForClientStatsLens as isContactEligibleForClientGeographyStats,
  isContactEligibleForFilleulStatsLens as isContactEligibleForFilleulGeographyStats,
  isContactEligibleForStatsLens as isContactEligibleForGeographyLens,
} from "./contact-stats-lenses";
