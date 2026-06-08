import type {
  NewsletterAudienceFilters,
  NewsletterAudienceMember,
  NewsletterAudiencePreview,
  NewsletterEligibleContact,
} from "@/lib/api/tauri-newsletter";

export function mergeExcludeContactIds(
  settingsExcludeContactIds: number[],
  editionExcludeContactIds: number[]
): number[] {
  return [...new Set([...settingsExcludeContactIds, ...editionExcludeContactIds])];
}

export function mergeNewsletterAudienceFilters(
  settingsFilters: NewsletterAudienceFilters,
  editionFilters: NewsletterAudienceFilters
): NewsletterAudienceFilters {
  return {
    excludePrescripteurs:
      settingsFilters.excludePrescripteurs || editionFilters.excludePrescripteurs,
    excludeSuspects: settingsFilters.excludeSuspects || editionFilters.excludeSuspects,
    excludeArchived: settingsFilters.excludeArchived || editionFilters.excludeArchived,
    excludeContactIds: mergeExcludeContactIds(
      settingsFilters.excludeContactIds,
      editionFilters.excludeContactIds
    ),
  };
}

export function isNewsletterMemberSelectable(member: NewsletterAudienceMember): boolean {
  return member.hasEmail && !member.unsubscribed;
}

export function isNewsletterMemberSettingsExcluded(
  member: NewsletterAudienceMember,
  settingsExcludeContactIds: number[]
): boolean {
  return settingsExcludeContactIds.includes(member.contactId);
}

export function isNewsletterMemberEditionSelectable(
  member: NewsletterAudienceMember,
  settingsExcludeContactIds: number[]
): boolean {
  return (
    isNewsletterMemberSelectable(member) &&
    !isNewsletterMemberSettingsExcluded(member, settingsExcludeContactIds)
  );
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
  selected: boolean,
  settingsExcludeContactIds: number[] = []
): number[] {
  const ids = new Set(excludeContactIds);
  for (const member of members) {
    if (!isNewsletterMemberEditionSelectable(member, settingsExcludeContactIds)) continue;
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
  editionFilters: NewsletterAudienceFilters,
  settingsExcludeContactIds: number[] = []
): NewsletterAudiencePreview {
  const effectiveExclude = mergeExcludeContactIds(
    settingsExcludeContactIds,
    editionFilters.excludeContactIds
  );
  const settingsSet = new Set(settingsExcludeContactIds);
  const editionSet = new Set(editionFilters.excludeContactIds);

  const withEmail = members.filter((m) => m.hasEmail).length;
  const permanentExcluded = members.filter((m) => m.unsubscribed).length;
  const settingsExcluded = members.filter(
    (m) => isNewsletterMemberSelectable(m) && settingsSet.has(m.contactId)
  ).length;
  const editionOnlyExcluded = members.filter(
    (m) =>
      isNewsletterMemberSelectable(m) &&
      editionSet.has(m.contactId) &&
      !settingsSet.has(m.contactId)
  ).length;

  const recipients: NewsletterEligibleContact[] = members
    .filter((m) => isNewsletterMemberSelected(m, effectiveExclude))
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
    excludedByFilters: settingsExcluded + editionOnlyExcluded,
    eligible: recipients.length,
    recipients,
  };
}
