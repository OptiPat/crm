import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  clearNewsletterComposerDraft,
  loadNewsletterComposerDraft,
  saveNewsletterComposerDraft,
} from "@/lib/newsletter/newsletter-composer-draft";
import { DEFAULT_NEWSLETTER_AUDIENCE_FILTERS } from "@/lib/api/tauri-newsletter";

function mockLocalStorage() {
  const store = new Map<string, string>();
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
  };
  vi.stubGlobal("localStorage", storage);
  return storage;
}

describe("newsletter-composer-draft", () => {
  beforeEach(() => {
    mockLocalStorage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("persists and restores composer state in localStorage", () => {
    saveNewsletterComposerDraft({
      tab: "composer",
      theme: "Assurance emprunteur",
      editionInstructions: "Ton sobre",
      structurePresetId: "actu-echeance",
      editMode: "sections",
      content: {
        subject: "Objet test",
        editionTitle: "Titre éditorial",
        intro: "Bonjour {{prenom}},",
        sections: [{ title: "Point 1", body: "Corps" }],
        cta: "RDV",
      },
      subject: "Objet test",
      plainBody: "Bonjour\n\nRDV",
      previewHtml: "<html></html>",
      chatHistory: [{ role: "user", content: "Plus court" }],
      chatSessionKey: 2,
      audienceFilters: {
        ...DEFAULT_NEWSLETTER_AUDIENCE_FILTERS,
        excludeContactIds: [42],
      },
      activeEditionId: 7,
      preparedQueueCount: 12,
    });
    const loaded = loadNewsletterComposerDraft();
    expect(loaded?.theme).toBe("Assurance emprunteur");
    expect(loaded?.structurePresetId).toBe("actu-echeance");
    expect(loaded?.editMode).toBe("sections");
    expect(loaded?.chatHistory).toHaveLength(1);
    expect(loaded?.content?.sections[0]?.title).toBe("Point 1");
    expect(loaded?.audienceFilters.excludeContactIds).toEqual([42]);
    expect(loaded?.activeEditionId).toBe(7);
  });

  it("clears storage when draft is empty", () => {
    saveNewsletterComposerDraft({
      tab: "composer",
      theme: "x",
      editionInstructions: "",
      structurePresetId: "libre",
      editMode: "plain",
      content: null,
      subject: "",
      plainBody: "",
      previewHtml: "",
      chatHistory: [],
      chatSessionKey: 0,
      audienceFilters: DEFAULT_NEWSLETTER_AUDIENCE_FILTERS,
      activeEditionId: null,
      preparedQueueCount: null,
    });
    expect(loadNewsletterComposerDraft()?.theme).toBe("x");
    saveNewsletterComposerDraft({
      tab: "composer",
      theme: "",
      editionInstructions: "",
      structurePresetId: "libre",
      editMode: "plain",
      content: null,
      subject: "",
      plainBody: "",
      previewHtml: "",
      chatHistory: [],
      chatSessionKey: 0,
      audienceFilters: DEFAULT_NEWSLETTER_AUDIENCE_FILTERS,
      activeEditionId: null,
      preparedQueueCount: null,
    });
    expect(loadNewsletterComposerDraft()).toBeNull();
    clearNewsletterComposerDraft();
    expect(loadNewsletterComposerDraft()).toBeNull();
  });
});
