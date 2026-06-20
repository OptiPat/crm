import { describe, expect, it } from "vitest";
import {
  bulletinMarkdownToHtml,
  bulletinMarkdownToPlainEmail,
} from "./bulletin-markdown-html";

describe("bulletin-markdown-html", () => {
  it("convertit titres, listes et gras", () => {
    const html = bulletinMarkdownToHtml(
      "## Comète — T1 2026\n\n**Chiffres clés**\n- Collecte : 132 M€\n- TO : 99,5 %"
    );
    expect(html).toContain("Comète");
    expect(html).toContain("<strong>Chiffres clés</strong>");
    expect(html).toContain("<ul");
    expect(html).toContain("132 M€");
  });

  it("aère les sections numérotées Mistral (une ligne par bloc)", () => {
    const md = [
      "## Comète — T1 2026",
      "1. SCPI Comète – T1 20262. Chiffres clés",
      "Collecte nette : 132,2 M€",
      "Capitalisation au 31.03.2026 : 652,0 M€",
      "3. Ce trimestre",
      "Dans un contexte géopolitique incertain.",
      "4. Acquisitions",
      "Pologne – Tarnobrzeg : Actif logistique.",
    ].join("\n");
    const html = bulletinMarkdownToHtml(md);
    expect(html).toContain("2. Chiffres clés");
    expect(html).toContain("Collecte nette");
    expect(html).toContain("3. Ce trimestre");
    expect(html).toContain("Dans un contexte");
    expect(html).not.toMatch(/20262\. Chiffres/);
    const collecteIdx = html.indexOf("Collecte nette");
    const chiffresIdx = html.indexOf("2. Chiffres clés");
    expect(collecteIdx).toBeGreaterThan(chiffresIdx);
  });

  it("produit un texte brut lisible", () => {
    const plain = bulletinMarkdownToPlainEmail(
      "## Comète — T1 2026\n\n- Collecte : 132 M€"
    );
    expect(plain).toContain("Comète");
    expect(plain).toContain("• Collecte");
  });

  it("echappe le HTML injecté", () => {
    const html = bulletinMarkdownToHtml("<script>alert(1)</script>");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
