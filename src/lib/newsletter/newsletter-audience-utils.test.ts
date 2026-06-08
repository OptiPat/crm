import { describe, expect, it } from "vitest";
import type { NewsletterAudienceMember } from "@/lib/api/tauri-newsletter";
import {
  computeNewsletterAudiencePreview,
  isNewsletterMemberEditionSelectable,
  isNewsletterMemberSelected,
  mergeExcludeContactIds,
  mergeNewsletterAudienceFilters,
  toggleNewsletterMemberSelection,
} from "@/lib/newsletter/newsletter-audience-utils";

const member = (overrides: Partial<NewsletterAudienceMember>): NewsletterAudienceMember => ({
  contactId: 1,
  nom: "Dupont",
  prenom: "Alice",
  email: "alice@example.com",
  categorie: "CLIENT",
  filleulCategorie: null,
  hasEmail: true,
  unsubscribed: false,
  ...overrides,
});

const emptyFilters = {
  excludePrescripteurs: false,
  excludeSuspects: false,
  excludeArchived: false,
  excludeContactIds: [] as number[],
};

describe("newsletter audience utils", () => {
  it("selects all with email except unsubscribed by default", () => {
    const members = [
      member({ contactId: 1 }),
      member({ contactId: 2, unsubscribed: true }),
      member({ contactId: 3, hasEmail: false, email: null }),
    ];
    const preview = computeNewsletterAudiencePreview(members, emptyFilters);
    expect(preview.eligible).toBe(1);
    expect(preview.recipients[0]?.contactId).toBe(1);
  });

  it("respects manual exclusions", () => {
    const members = [member({ contactId: 1 }), member({ contactId: 2, nom: "Martin" })];
    expect(isNewsletterMemberSelected(member({ contactId: 2 }), [2])).toBe(false);
    const preview = computeNewsletterAudiencePreview(members, {
      ...emptyFilters,
      excludeContactIds: [2],
    });
    expect(preview.eligible).toBe(1);
    expect(preview.excludedByFilters).toBe(1);
  });

  it("merges settings and edition exclusions", () => {
    expect(mergeExcludeContactIds([1, 2], [2, 3])).toEqual([1, 2, 3]);
    const merged = mergeNewsletterAudienceFilters(
      { ...emptyFilters, excludeContactIds: [1] },
      { ...emptyFilters, excludeContactIds: [2] }
    );
    expect(merged.excludeContactIds).toEqual([1, 2]);
  });

  it("applies settings exclusions in preview even without edition excludes", () => {
    const members = [member({ contactId: 1 }), member({ contactId: 2, nom: "Martin" })];
    const preview = computeNewsletterAudiencePreview(members, emptyFilters, [2]);
    expect(preview.eligible).toBe(1);
    expect(preview.excludedByFilters).toBe(1);
  });

  it("blocks edition toggle for settings-excluded members", () => {
    const m = member({ contactId: 5 });
    expect(isNewsletterMemberEditionSelectable(m, [5])).toBe(false);
  });

  it("toggles member selection via exclude list", () => {
    const m = member({ contactId: 5 });
    expect(toggleNewsletterMemberSelection(m, [], false)).toEqual([5]);
    expect(toggleNewsletterMemberSelection(m, [5], true)).toEqual([]);
  });
});
