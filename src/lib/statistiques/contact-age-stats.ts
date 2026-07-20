import type { Contact } from "@/lib/api/tauri-contacts";
import { computeAgeAtDate } from "@/lib/contacts/contact-birthday";
import {
  isContactEligibleForStatsLens,
  type ContactStatsLens,
} from "./contact-stats-lenses";

export type AgeLens = ContactStatsLens;

export type ContactAgeStatResult = {
  averageAge: number | null;
  countedCount: number;
  totalEligible: number;
  missingBirthDateCount: number;
  contactIds: number[];
};

export type AgeListKind = "withBirthDate" | "missingBirthDate";

function hasBirthDate(dateNaissance?: number | null): dateNaissance is number {
  return dateNaissance != null && dateNaissance !== 0;
}

export function computeContactAgeStats(
  contacts: Contact[],
  lens: AgeLens,
  ref = new Date()
): ContactAgeStatResult {
  const eligible = contacts.filter(
    (contact) => contact.id != null && isContactEligibleForStatsLens(contact, lens)
  );
  const totalEligible = eligible.length;
  const withBirthDate = eligible.filter((contact) => hasBirthDate(contact.date_naissance));
  const countedCount = withBirthDate.length;

  if (countedCount === 0) {
    return {
      averageAge: null,
      countedCount: 0,
      totalEligible,
      missingBirthDateCount: totalEligible,
      contactIds: [],
    };
  }

  let ageSum = 0;
  const contactIds: number[] = [];

  for (const contact of withBirthDate) {
    const age = computeAgeAtDate(contact.date_naissance!, ref);
    ageSum += age;
    contactIds.push(contact.id!);
  }

  return {
    averageAge: ageSum / countedCount,
    countedCount,
    totalEligible,
    missingBirthDateCount: totalEligible - countedCount,
    contactIds,
  };
}

export function filterContactsForAgeLens(
  contacts: Contact[],
  lens: AgeLens,
  kind: AgeListKind = "withBirthDate"
): Contact[] {
  return contacts.filter((contact) => {
    if (contact.id == null || !isContactEligibleForStatsLens(contact, lens)) return false;
    const hasDate = hasBirthDate(contact.date_naissance);
    return kind === "withBirthDate" ? hasDate : !hasDate;
  });
}

export function formatAverageAgeLabel(averageAge: number): string {
  const rounded = Math.round(averageAge * 10) / 10;
  const label = rounded.toFixed(1).replace(".0", "").replace(".", ",");
  return `${label} ans`;
}

export function formatAgeStatsSubtitle(stats: ContactAgeStatResult): string {
  if (stats.countedCount === 0) return "Aucune date de naissance renseignée";
  const missing =
    stats.missingBirthDateCount > 0
      ? ` · ${stats.missingBirthDateCount} sans date de naissance`
      : "";
  return `Calculé sur ${stats.countedCount} contact${stats.countedCount > 1 ? "s" : ""}${missing}`;
}
