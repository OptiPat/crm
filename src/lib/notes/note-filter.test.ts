import { describe, expect, it } from "vitest";
import type { PersonalNote, SharedNote } from "@/lib/api/tauri-notes";
import {
  draftFromPersonalNote,
  filterPersonalNotes,
  filterSharedNotes,
  isPersonalNoteDraftDirty,
  uniquePersonalNoteCategories,
} from "@/lib/notes/note-filter";

const personalNote = (overrides: Partial<PersonalNote> = {}): PersonalNote => ({
  id: 1,
  title: "Import contacts",
  content_html: "<p>Étapes détaillées</p>",
  category: "Process",
  pinned: false,
  created_at: 1_700_000_000,
  updated_at: 1_700_000_100,
  ...overrides,
});

const sharedNote = (overrides: Partial<SharedNote> = {}): SharedNote => ({
  id: "abc",
  title: "Procédure KYC",
  content_html: "<p>Vérifier identité</p>",
  author_installation_id: "inst-1",
  author_name: "LEGRAND Paul",
  created_at: 1_700_000_000,
  updated_at: 1_700_000_100,
  contributions: [],
  can_edit: false,
  can_delete: false,
  ...overrides,
});

describe("note-filter", () => {
  it("détecte un brouillon modifié", () => {
    const baseline = draftFromPersonalNote(personalNote());
    const dirty = { ...baseline, title: "Autre titre" };
    expect(isPersonalNoteDraftDirty(dirty, baseline)).toBe(true);
    expect(isPersonalNoteDraftDirty(baseline, baseline)).toBe(false);
  });

  it("filtre les notes personnelles par catégorie et recherche", () => {
    const notes = [
      personalNote({ id: 1, title: "Import", category: "Process" }),
      personalNote({
        id: 2,
        title: "Email relance",
        category: "Email",
        content_html: "<p>Rappel client</p>",
      }),
    ];
    expect(filterPersonalNotes(notes, "", "Email")).toHaveLength(1);
    expect(filterPersonalNotes(notes, "relance", "all")).toHaveLength(1);
    expect(filterPersonalNotes(notes, "étapes", "all")).toHaveLength(1);
  });

  it("extrait les catégories uniques triées", () => {
    const notes = [
      personalNote({ category: "Email" }),
      personalNote({ id: 2, category: "Process" }),
      personalNote({ id: 3, category: "Email" }),
      personalNote({ id: 4, category: null }),
    ];
    expect(uniquePersonalNoteCategories(notes)).toEqual(["Email", "Process"]);
  });

  it("filtre les notes partagées par titre, auteur et contenu", () => {
    const notes = [
      sharedNote(),
      sharedNote({
        id: "def",
        title: "Autre",
        author_name: "BERNARD Luc",
        content_html: "<p>Rien en commun</p>",
      }),
    ];
    expect(filterSharedNotes(notes, "kyc")).toHaveLength(1);
    expect(filterSharedNotes(notes, "legrand")).toHaveLength(1);
    expect(filterSharedNotes(notes, "identité")).toHaveLength(1);
  });

  it("ignore les divergences de sanitisation HTML", () => {
    const baseline = draftFromPersonalNote(
      personalNote({ content_html: '<span style="font-weight: bolder">Gras</span>' })
    );
    const draft = { ...baseline, content_html: "<b>Gras</b>" };
    expect(isPersonalNoteDraftDirty(draft, baseline)).toBe(false);
  });
});
