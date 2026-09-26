import { describe, expect, it } from "vitest";
import {
  appendContactNote,
  deleteContactNote,
  listContactNotesNewestFirst,
  parseContactNotesLog,
  updateContactNote,
} from "@/lib/contacts/contact-notes-log";

const at = new Date(2026, 8, 26, 19, 35);
const later = new Date(2026, 8, 26, 19, 40);

describe("contact notes log", () => {
  it("ajoute une note horodatée sur un texte vide", () => {
    expect(appendContactNote("", "  Bonjour  ", at)).toBe("[26/09/2026 19:35]\nBonjour");
  });

  it("conserve le texte antérieur et ajoute la nouvelle note après", () => {
    const next = appendContactNote("Ancien mémo", "Suite", at);
    expect(next).toBe("Ancien mémo\n\n[26/09/2026 19:35]\nSuite");
    expect(listContactNotesNewestFirst(next)).toEqual([
      { at: "26/09/2026 19:35", body: "Suite", index: 1 },
      { at: null, body: "Ancien mémo", index: 0 },
    ]);
  });

  it("empile les notes et affiche la plus récente en premier", () => {
    const first = appendContactNote("", "Un", at);
    const second = appendContactNote(first, "Deux", later);
    expect(listContactNotesNewestFirst(second)).toEqual([
      { at: "26/09/2026 19:40", body: "Deux", index: 1 },
      { at: "26/09/2026 19:35", body: "Un", index: 0 },
    ]);
  });

  it("garde un corps sur plusieurs lignes", () => {
    const raw = appendContactNote("", "Ligne 1\nLigne 2", at);
    expect(parseContactNotesLog(raw)).toEqual([
      { at: "26/09/2026 19:35", body: "Ligne 1\nLigne 2" },
    ]);
  });

  it("modifie le texte sans changer l'heure", () => {
    const raw = appendContactNote("Ancien mémo", "Suite", at);
    expect(updateContactNote(raw, 1, "  Suite corrigée  ")).toBe(
      "Ancien mémo\n\n[26/09/2026 19:35]\nSuite corrigée"
    );
  });

  it("supprime une note horodatée ou le texte sans date", () => {
    const raw = appendContactNote("Ancien mémo", "Suite", at);
    expect(deleteContactNote(raw, 1)).toBe("Ancien mémo");
    expect(deleteContactNote(raw, 0)).toBe("[26/09/2026 19:35]\nSuite");
  });

  it("ignore la ligne Date inscription et une note vide", () => {
    expect(appendContactNote("Date inscription: 01/01/2020\n\nhello", "   ", at)).toBe("hello");
    expect(parseContactNotesLog("Date inscription: 01/01/2020")).toEqual([]);
  });
});
