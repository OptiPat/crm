import type {
  NewsletterAudienceFilters,
  NewsletterAudienceMember,
  NewsletterAudiencePreview,
  NewsletterEligibleContact,
} from "@/lib/api/tauri-newsletter";

export function isNewsletterMemberSelectable(member: NewsletterAudienceMember): boolean {
  return member.hasEmail && !member.unsubscribed;
}

export function isNewsletterMemberSelected(
  member: NewsletterAudienceMember,
  excludeContactIds: number[]
): boolean {
  return isNewsletterMemberSelectable(member) && !excludeContactIds.includes(member.contactId);
}

export function toggleNewsletterMemberSelection(
  member: NewsletterAudienceMember,
  excludeContactIds: number[],
  selected: boolean
): number[] {
  if (!isNewsletterMemberSelectable(member)) {
    return excludeContactIds;
  }
  if (selected) {
    return excludeContactIds.filter((id) => id !== member.contactId);
  }
  if (excludeContactIds.includes(member.contactId)) {
    return excludeContactIds;
  }
  return [...excludeContactIds, member.contactId];
}

export function setNewsletterMembersSelection(
  members: NewsletterAudienceMember[],
  excludeContactIds: number[],
  selected: boolean
): number[] {
  const ids = new Set(excludeContactIds);
  for (const member of members) {
    if (!isNewsletterMemberSelectable(member)) continue;
    if (selected) {
      ids.delete(member.contactId);
    } else {
      ids.add(member.contactId);
    }
  }
  return [...ids];
}

export function computeNewsletterAudiencePreview(
  members: NewsletterAudienceMember[],
  filters: NewsletterAudienceFilters
): NewsletterAudiencePreview {
  const withEmail = members.filter((m) => m.hasEmail).length;
  const permanentExcluded = members.filter((m) => m.unsubscribed).length;
  const excludedSet = new Set(filters.excludeContactIds);
  const manuallyExcluded = members.filter(
    (m) => isNewsletterMemberSelectable(m) && excludedSet.has(m.contactId)
  ).length;

  const recipients: NewsletterEligibleContact[] = members
    .filter((m) => isNewsletterMemberSelected(m, filters.excludeContactIds))
    .map((m) => ({
      contactId: m.contactId,
      nom: m.nom,
      prenom: m.prenom,
      email: m.email ?? "",
      categorie: m.categorie,
      filleulCategorie: m.filleulCategorie,
    }));

  return {
    totalContacts: members.length,
    withEmail,
    withoutEmail: members.length - withEmail,
    permanentExcluded,
    excludedByFilters: manuallyExcluded,
    eligible: recipients.length,
    recipients,
  };
}
