import type { Contact } from "@/lib/api/tauri-contacts";
import {
  GEOGRAPHY_FOREIGN_KEY,
  GEOGRAPHY_UNSET_KEY,
  geographyGroupKeyFromContact,
  geographyGroupLabel,
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

  const buckets = new Map<string, number[]>();

  for (const contact of eligible) {
    const key = geographyGroupKeyFromContact(contact);
    const ids = buckets.get(key) ?? [];
    ids.push(contact.id!);
    buckets.set(key, ids);
  }

  const rows: ContactGeographyStatRow[] = [...buckets.entries()].map(([key, contactIds]) => ({
    key,
    label: geographyGroupLabel(key),
    count: contactIds.length,
    percent: (contactIds.length / total) * 100,
    contactIds,
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
