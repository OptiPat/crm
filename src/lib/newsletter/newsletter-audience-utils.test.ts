import { describe, expect, it } from "vitest";
import type { NewsletterAudienceMember } from "@/lib/api/tauri-newsletter";
import {
  computeNewsletterAudiencePreview,
  isNewsletterMemberSelected,
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

describe("newsletter audience utils", () => {
  it("selects all with email except unsubscribed by default", () => {
    const members = [
      member({ contactId: 1 }),
      member({ contactId: 2, unsubscribed: true }),
      member({ contactId: 3, hasEmail: false, email: null }),
    ];
    const preview = computeNewsletterAudiencePreview(members, {
      excludePrescripteurs: false,
      excludeSuspects: false,
      excludeArchived: false,
      excludeContactIds: [],
    });
    expect(preview.eligible).toBe(1);
    expect(preview.recipients[0]?.contactId).toBe(1);
  });

  it("respects manual exclusions", () => {
    const members = [member({ contactId: 1 }), member({ contactId: 2, nom: "Martin" })];
    expect(
      isNewsletterMemberSelected(member({ contactId: 2 }), [2])
    ).toBe(false);
    const preview = computeNewsletterAudiencePreview(members, {
      excludePrescripteurs: false,
      excludeSuspects: false,
      excludeArchived: false,
      excludeContactIds: [2],
    });
    expect(preview.eligible).toBe(1);
    expect(preview.excludedByFilters).toBe(1);
  });

  it("toggles member selection via exclude list", () => {
    const m = member({ contactId: 5 });
    expect(toggleNewsletterMemberSelection(m, [], false)).toEqual([5]);
    expect(toggleNewsletterMemberSelection(m, [5], true)).toEqual([]);
  });
});
