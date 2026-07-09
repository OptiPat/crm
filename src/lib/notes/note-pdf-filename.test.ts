import { describe, expect, it } from "vitest";
import { buildNotePdfFilename, sanitizeNoteFilenamePart } from "./note-pdf-filename";
import { buildPersonalNotePrintDocument } from "./note-print-document";

describe("note-pdf-filename", () => {
  it("sanitize invalid Windows chars", () => {
    expect(sanitizeNoteFilenamePart('Process: import?')).toBe("Process- import");
  });

  it("builds pdf filename", () => {
    expect(buildNotePdfFilename("Start Gmail")).toBe("Note - Start Gmail.pdf");
  });
});

describe("buildPersonalNotePrintDocument", () => {
  it("requires a title", () => {
    expect(
      buildPersonalNotePrintDocument({ title: "  ", category: "", contentHtml: "<p>x</p>" })
    ).toBeNull();
  });

  it("includes category as subtitle", () => {
    const doc = buildPersonalNotePrintDocument({
      title: "Process import",
      category: "Process",
      contentHtml: "<p>Étapes</p>",
    });
    expect(doc?.subtitle).toBe("Process");
    expect(doc?.sections[0]?.contentHtml).toContain("Étapes");
  });
});
