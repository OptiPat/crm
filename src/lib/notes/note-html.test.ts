import { describe, expect, it } from "vitest";
import { sanitizeNoteHtml } from "@/lib/notes/note-html";

describe("note-html", () => {
  it("conserve les couleurs de texte et de surlignage", () => {
    const out = sanitizeNoteHtml(
      '<p><span style="color:#ff0000">Rouge</span> <span style="background-color:#ffff00">Jaune</span></p>'
    );
    expect(out).toContain("color: #ff0000");
    expect(out).toContain("background-color: #ffff00");
  });

  it("conserve les couleurs rgb", () => {
    const out = sanitizeNoteHtml('<span style="color:rgb(10, 20, 30)">Texte</span>');
    expect(out).toContain("color: rgb(10, 20, 30)");
  });

  it("conserve la couleur si d'autres déclarations CSS sont présentes", () => {
    const out = sanitizeNoteHtml(
      '<span style="color: rgb(217, 119, 6); font-family: Arial;">Texte</span>'
    );
    expect(out).toContain("color: rgb(217, 119, 6)");
    expect(out).not.toContain("font-family");
  });

  it("convertit les balises font en span coloré", () => {
    const out = sanitizeNoteHtml('<font color="#ff0000">Rouge</font>');
    expect(out).toContain('color: #ff0000');
    expect(out).not.toContain("<font");
  });

  it("normalise le style des listes pour l'aperçu", () => {
    const out = sanitizeNoteHtml("<ul><li>test</li></ul>");
    expect(out).toContain('padding-left:1.25em');
    expect(out).toContain("<li");
  });

  it("retire les scripts et conserve le gras", () => {
    const out = sanitizeNoteHtml(
      '<p>OK</p><script>alert(1)</script><strong>X</strong>'
    );
    expect(out).toContain("<strong>X</strong>");
    expect(out).not.toContain("script");
  });

  it("conserve les images data URL et https", () => {
    const dataImg =
      '<img src="data:image/png;base64,iVBORw0KGgo=" alt="Capture" style="max-width:100%;height:auto">';
    const httpsImg = '<img src="https://example.com/a.png" alt="Web">';
    const out = sanitizeNoteHtml(`<div>${dataImg}${httpsImg}</div>`);
    expect(out).toContain("data:image/png;base64");
    expect(out).toContain("https://example.com/a.png");
    expect(out).toContain('alt="Capture"');
  });

  it("retire les images data URL trop volumineuses", () => {
    const hugeB64 = "A".repeat(1_100_000);
    const out = sanitizeNoteHtml(`<img src="data:image/png;base64,${hugeB64}" alt="X">`);
    expect(out).not.toContain("<img");
  }, 10_000);

  it("retire les images non sûres", () => {
    const out = sanitizeNoteHtml('<img src="javascript:alert(1)">');
    expect(out).not.toContain("<img");
  });

  it("retire les couleurs non valides", () => {
    const out = sanitizeNoteHtml('<span style="color:expression(alert(1))">X</span>');
    expect(out).not.toContain("expression");
  });
});
