import { describe, expect, it } from "vitest";
import {
  buildComposerRestoreFromEdition,
  editionAudienceFiltersFromStored,
} from "@/lib/newsletter/newsletter-composer-restore";
import { DEFAULT_NEWSLETTER_AUDIENCE_FILTERS } from "@/lib/api/tauri-newsletter";

describe("newsletter-composer-restore", () => {
  it("extrait les filtres édition depuis les filtres fusionnés", () => {
    const stored = {
      excludePrescripteurs: true,
      excludeSuspects: false,
      excludeArchived: true,
      excludeContactIds: [1, 2, 99],
    };
    const settings = {
      excludePrescripteurs: false,
      excludeSuspects: false,
      excludeArchived: true,
      excludeContactIds: [1],
    };
    expect(editionAudienceFiltersFromStored(stored, settings)).toEqual({
      excludePrescripteurs: true,
      excludeSuspects: false,
      excludeArchived: false,
      excludeContactIds: [2, 99],
    });
  });

  it("restaure le contenu structuré depuis contentJson", () => {
    const payload = buildComposerRestoreFromEdition(
      {
        editionId: 1,
        cancelledQueueCount: 3,
        editionLabel: "Juin 2026",
        subject: "Objet",
        plainBody: "Corps",
        contentJson: JSON.stringify({ subject: "Objet", intro: "Intro", sections: [], cta: "" }),
        theme: "Thème",
        editionInstructions: "Sobre",
        audienceFilters: DEFAULT_NEWSLETTER_AUDIENCE_FILTERS,
      },
      DEFAULT_NEWSLETTER_AUDIENCE_FILTERS
    );
    expect(payload.editMode).toBe("sections");
    expect(payload.content?.intro).toBe("Intro");
    expect(payload.theme).toBe("Thème");
  });
});
