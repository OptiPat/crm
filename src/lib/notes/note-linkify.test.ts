import { describe, expect, it } from "vitest";
import {
  linkifyPlainUrlsInHtmlString,
  normalizeNoteHref,
  trimTrailingUrlPunctuation,
} from "@/lib/notes/note-linkify";

describe("note-linkify", () => {
  it("normalise les URL www.", () => {
    expect(normalizeNoteHref("www.example.com")).toBe("https://www.example.com");
  });

  it("conserve http(s) et mailto", () => {
    expect(normalizeNoteHref("https://example.com/path")).toBe("https://example.com/path");
    expect(normalizeNoteHref("mailto:test@example.com")).toBe("mailto:test@example.com");
  });

  it("retire la ponctuation finale", () => {
    expect(trimTrailingUrlPunctuation("https://example.com.")).toBe("https://example.com");
    expect(normalizeNoteHref("https://example.com).")).toBe("https://example.com");
  });

  it("rejette les schémas non sûrs", () => {
    expect(normalizeNoteHref("javascript:alert(1)")).toBeNull();
    expect(normalizeNoteHref("ftp://example.com")).toBeNull();
  });

  it("transforme une URL en texte brut en lien", () => {
    const out = linkifyPlainUrlsInHtmlString(
      "<p>Voir https://example.com/doc pour plus d'infos.</p>"
    );
    expect(out).toContain('<a href="https://example.com/doc">');
    expect(out).toContain("https://example.com/doc</a>");
  });

  it("ne double pas les liens existants", () => {
    const out = linkifyPlainUrlsInHtmlString(
      '<p>Déjà <a href="https://example.com">lien</a> ici.</p>'
    );
    expect(out.match(/<a\b/g)?.length ?? 0).toBe(1);
  });
});
