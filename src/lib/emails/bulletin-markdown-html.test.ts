import { describe, expect, it } from "vitest";
import {
  bulletinMarkdownToHtml,
  bulletinMarkdownToPlainEmail,
  normalizeScpiBulletinDigest,
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
    expect(html).toContain("<strong>Chiffres clés</strong>");
    expect(html).toContain("Collecte nette");
    expect(html).toContain("<strong>Ce trimestre</strong>");
    expect(html).toContain("Dans un contexte");
    expect(html).not.toMatch(/20262\. Chiffres/);
    const collecteIdx = html.indexOf("Collecte nette");
    const chiffresIdx = html.indexOf("Chiffres clés");
    expect(collecteIdx).toBeGreaterThan(chiffresIdx);
  });

  it("produit un texte brut lisible", () => {
    const plain = bulletinMarkdownToPlainEmail(
      "## Comète — T1 2026\n\n- Collecte : 132 M€"
    );
    expect(plain).toContain("Comète");
    expect(plain).toContain("• Collecte");
  });

  it("normalise les sous-sections numérotées en titres gras", () => {
    const md = [
      "1. Transitions Europe – T1 2026",
      "2. Chiffres clés",
      "- Collecte : 147 M€",
      "3. Ce trimestre",
      "Dynamique confirmée.",
    ].join("\n");
    const html = bulletinMarkdownToHtml(md);
    expect(html).toContain("<strong>Chiffres clés</strong>");
    expect(html).not.toContain("2. Chiffres clés");
    expect(html).toContain("<strong>Ce trimestre</strong>");
  });

  it("supprime les en-têtes ## redondants", () => {
    const md = "## Europe\n\n1. Europe – T1 2026\n\n**Chiffres clés**\n- Collecte";
    const normalized = normalizeScpiBulletinDigest(md);
    expect(normalized).not.toContain("## Europe");
    expect(normalized).toContain("1. Europe – T1 2026");
  });

  it("echappe le HTML injecté", () => {
    const html = bulletinMarkdownToHtml("<script>alert(1)</script>");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("recolle une année 2026 sur plusieurs lignes Mistral", () => {
    const md = [
      "3. Ce trimestre",
      "Le dividende brut s'élève à 4,10 €/part, en ligne avec l'objectif de distribution",
      "2",
      "0",
      "2",
      "6. Malgré un contexte géopolitique incertain.",
    ].join("\n");
    const plain = bulletinMarkdownToPlainEmail(md);
    expect(plain).toContain("distribution 2026. Malgré");
    expect(plain).not.toMatch(/distribution\n2\n0\n2\n6/);
  });

  it("ne coupe pas 2026. en fin de phrase lors du split des sections", () => {
    const md =
      "3. Ce trimestre\nObjectif de distribution 2026. Malgré un contexte incertain.";
    const plain = bulletinMarkdownToPlainEmail(md);
    expect(plain).toContain("distribution 2026. Malgré");
    expect(plain).not.toMatch(/distribution 202\n/);
  });
});
