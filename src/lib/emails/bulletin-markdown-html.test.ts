import { describe, expect, it } from "vitest";
import {
  bulletinMarkdownToHtml,
  bulletinMarkdownToPlainEmail,
  normalizeScpiBulletinDigest,
} from "./bulletin-markdown-html";
import { parseScpiCampaignVariables } from "./scpi-bulletin-preview-vars";

describe("bulletin-markdown-html", () => {
  it("convertit titres, listes et gras", () => {
    const html = bulletinMarkdownToHtml(
      "## Comète — T1 2026\n\n1. Chiffres clés\n- Collecte : 132 M€\n- TO : 99,5 %"
    );
    expect(html).toContain("Comète");
    expect(html).toContain("font-size:1.1em");
    expect(html).toContain("1. Chiffres clés");
    expect(html).toContain("<ul");
    expect(html).toContain("132 M€");
  });

  it("aère les sections numérotées Mistral (une ligne par bloc)", () => {
    const md = [
      "Comète – T1 2026",
      "1. SCPI Comète – T1 20261. Chiffres clés",
      "Collecte nette : 132,2 M€",
      "Capitalisation au 31.03.2026 : 652,0 M€",
      "2. Ce trimestre",
      "Dans un contexte géopolitique incertain.",
      "3. Acquisitions",
      "Pologne – Tarnobrzeg : Actif logistique.",
    ].join("\n");
    const html = bulletinMarkdownToHtml(md);
    expect(html).toContain("1. Chiffres clés");
    expect(html).toContain("Collecte nette");
    expect(html).toContain("2. Ce trimestre");
    expect(html).toContain("Dans un contexte");
    expect(html).not.toMatch(/20261\. Chiffres/);
    const collecteIdx = html.indexOf("Collecte nette");
    const chiffresIdx = html.indexOf("Chiffres clés");
    expect(collecteIdx).toBeGreaterThan(chiffresIdx);
  });

  it("produit un texte brut lisible", () => {
    const plain = bulletinMarkdownToPlainEmail(
      "## Comète — T1 2026\n\n1. Chiffres clés\n- Collecte : 132 M€"
    );
    expect(plain).toContain("Comète");
    expect(plain).toContain("1. Chiffres clés");
    expect(plain).toContain("• Collecte");
  });

  it("normalise le format Mistral legacy (titre sans numéro, sections 1-3)", () => {
    const md = [
      "1. Transitions Europe – T1 2026",
      "2. Chiffres clés",
      "- Collecte : 147 M€",
      "3. Ce trimestre",
      "Dynamique confirmée.",
    ].join("\n");
    const html = bulletinMarkdownToHtml(md);
    expect(html).toContain("Transitions Europe");
    expect(html).not.toContain("1. Transitions Europe");
    expect(html).toContain("1. Chiffres clés");
    expect(html).not.toContain("2. Chiffres clés");
    expect(html).toContain("2. Ce trimestre");
    expect(html).not.toContain("3. Ce trimestre");
  });

  it("supprime les en-têtes ## redondants", () => {
    const md = "## Europe\n\n1. Europe – T1 2026\n\n2. Chiffres clés\n- Collecte";
    const normalized = normalizeScpiBulletinDigest(md, "T1 2026");
    expect(normalized).not.toMatch(/^## Europe\s*$/m);
    expect(normalized).toContain("## Europe – T1 2026");
    expect(normalized).toContain("1. Chiffres clés");
  });

  it("echappe le HTML injecté", () => {
    const html = bulletinMarkdownToHtml("<script>alert(1)</script>");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("recolle une année 2026 sur plusieurs lignes Mistral", () => {
    const md = [
      "2. Ce trimestre",
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
      "2. Ce trimestre\nObjectif de distribution 2026. Malgré un contexte incertain.";
    const plain = bulletinMarkdownToPlainEmail(md);
    expect(plain).toContain("distribution 2026. Malgré");
    expect(plain).not.toMatch(/distribution 202\n/);
  });

  it("nettoie le format Mistral ** cassé et les titres répétés", () => {
    const md = [
      "Comete – T1 2026",
      "",
      "**",
      "1. Chiffres clés**",
      "Collecte nette de 132,2 M€ au premier trimestre.",
      "**",
      "2. Ce trimestre**",
      "Comete – T1 2026",
      "**",
      "3. Acquisitions**",
      "Pologne, Tarnobrzeg : actif logistique.",
      "Comete – T1 2026",
      "Comete – T1 2026",
      "Comete – T1 2026",
      "Comete – T1 2026",
      "Espagne, Getafe et Villaviciosa de Odón : deux actifs de loisirs.",
    ].join("\n");
    const plain = bulletinMarkdownToPlainEmail(md);
    expect(plain).not.toContain("**");
    expect(plain).toContain("1. Chiffres clés");
    expect(plain).toContain("132,2 M€");
    expect(plain).not.toContain("2. Ce trimestre");
    expect(plain).toContain("Pologne, Tarnobrzeg");
    expect(plain).toContain("Espagne, Getafe");
    expect((plain.match(/Comete – T1 2026/g) ?? []).length).toBe(1);
  });

  it("normalise le format Mistral avec tirets et titre dupliqué sous Ce trimestre", () => {
    const md = [
      "Comete – T1 2026",
      "",
      "-",
      "1. Chiffres clés :",
      "La collecte nette atteint 132,2 M€ pour le trimestre.",
      "-",
      "2. Ce trimestre :",
      "Comete – T1 2026",
      "-",
      "3. Acquisitions :",
      "Pologne, Tarnobrzeg : Actif logistique.",
    ].join("\n");
    const html = bulletinMarkdownToHtml(md);
    expect(html).toContain("<strong");
    expect(html).toContain("Comete");
    expect(html).toContain("1. Chiffres clés");
    expect(html).not.toContain("2. Ce trimestre");
    const plain = bulletinMarkdownToPlainEmail(md);
    expect(plain).not.toContain("\n-\n");
    expect(plain).not.toMatch(/2\. Ce trimestre\s*\nComete – T1 2026/);
    expect(plain).toContain("132,2 M€");
  });

  it("met en gras les sous-sections sans accent (Chiffres cles) et puces acquisitions", () => {
    const md = [
      "Comete – T1 2026",
      "1. Chiffres cles",
      "Collecte nette de 132,2 M€.",
      "2. Ce trimestre",
      "Dynamique soutenue.",
      "3. Acquisitions",
      "Canada, Trans-Canada : entrepôt industriel.",
      "Royaume-Uni, Édimbourg : bâtiment mixte.",
    ].join("\n");
    const html = bulletinMarkdownToHtml(md);
    expect(html).toContain("<strong>1. Chiffres clés</strong>");
    expect(html).toContain("<ul");
    expect(html).toContain("Trans-Canada");
    const plain = bulletinMarkdownToPlainEmail(md);
    expect(plain).toContain("• Canada, Trans-Canada");
    expect(plain).toContain("• Royaume-Uni");
  });

  it("conserve les lignes d acquisitions avec tiret (Royaume-Uni, Trans-Canada)", () => {
    const md = [
      "Comete – T1 2026",
      "",
      "1. Chiffres clés",
      "Collecte nette : 132 M€",
      "2. Ce trimestre",
      "Dynamique soutenue au Canada et en Europe.",
      "3. Acquisitions",
      "Canada, Trans-Canada : entrepôt industriel.",
      "Royaume-Uni, Édimbourg : bâtiment mixte.",
      "Espagne, Getafe : loisirs.",
    ].join("\n");
    const plain = bulletinMarkdownToPlainEmail(md);
    expect(plain).toContain("Trans-Canada");
    expect(plain).toContain("Royaume-Uni");
    expect(plain).toContain("Getafe");
    expect((plain.match(/Comete – T1 2026/g) ?? []).length).toBe(1);
  });

  it("normalise digest multi-SCPI Mistral (titres, sections, doublon **)", () => {
    const md = [
      "1. Comete – 1er trimestre 2026",
      "",
      "2. Chiffres clés",
      "Collecte nette : 132,2 M€",
      "",
      "3. Ce trimestre",
      "Dans un contexte.",
      "",
      "4. Acquisitions",
      "Pologne.",
      "",
      "---",
      "",
      "1. Epargne Pierre Europe – 1er trimestre 2026**",
      "",
      "2. Chiffres clés",
      "Capitalisation : 635 M€",
      "",
      "1. Epargne Pierre Europe – 1er trimestre 2026**",
    ].join("\n");
    const normalized = normalizeScpiBulletinDigest(md, "T1 2026");
    const vars = parseScpiCampaignVariables(
      JSON.stringify({ periode: "T1 2026", scpi_count: 2, bulletin_resume: normalized })
    );
    const plain = vars.bulletin_resume;
    expect(plain).toContain("1. Chiffres clés");
    expect(plain).not.toContain("2. Chiffres clés");
    expect(plain).not.toMatch(/\*\*$/m);
    expect((plain.match(/Epargne Pierre Europe – T1 2026/g) ?? []).length).toBe(1);
    expect(plain).toContain("Comete – T1 2026");
    expect(plain).not.toMatch(/^1\. Comete/m);
  });

  it("dedupe Comete/Comète et retire les titres orphelins en fin de digest", () => {
    const md = [
      "Comete – T1 2026",
      "",
      "Comète – T1 2026",
      "",
      "1. Chiffres clés",
      "Collecte nette : 132,2 M€",
      "2. Ce trimestre",
      "Dynamique soutenue.",
      "3. Acquisitions",
      "Pologne, Tarnobrzeg : logistique.",
      "",
      "---",
      "",
      "Transitions Europe – T1 2026",
      "",
      "Transitions Europe – T1 2026",
      "",
      "1. Chiffres clés",
      "Collecte nette de 147 M€",
      "",
      "Excellente journée.",
      "",
      "Comete – T1 2026",
      "Comète – T1 2026",
      "Transitions Europe – T1 2026",
      "Transitions Europe – T1 2026",
    ].join("\n");
    const plain = bulletinMarkdownToPlainEmail(md, true, "T1 2026");
    expect(plain).toContain("Comète – T1 2026");
    expect(plain).not.toMatch(/Comete – T1 2026/);
    expect((plain.match(/Comète – T1 2026/g) ?? []).length).toBe(1);
    expect((plain.match(/Transitions Europe – T1 2026/g) ?? []).length).toBe(1);
    expect(plain).toContain("Excellente journée.");
    expect(plain.trim().endsWith("Excellente journée.")).toBe(true);
  });

  it("rend le titre SCPI en gras meme avec puce Mistral (- Comète)", () => {
    const md = [
      "- Comete – T1 2026",
      "",
      "- Comète – T1 2026",
      "",
      "1. Chiffres clés",
      "- Collecte nette de 132,2 M€",
    ].join("\n");
    const html = bulletinMarkdownToHtml(md, true, "T1 2026");
    const plain = bulletinMarkdownToPlainEmail(md, true, "T1 2026");
    expect(html).toContain("font-size:1.1em");
    expect(html).not.toMatch(/<ul[^>]*>[\s\S]*Comète/);
    expect((plain.match(/Comète – T1 2026/g) ?? []).length).toBe(1);
    expect(plain).not.toMatch(/^• Comète/m);
  });

  it("reproduit le cas Coralie (multi) et Philippe (single) depuis digest prepare", () => {
    const coralie = [
      "Comete – T1 2026",
      "Comète – T1 2026",
      "",
      "1. Chiffres clés",
      "Collecte nette de 132,2 M€",
      "2. Ce trimestre",
      "Dynamique.",
      "3. Acquisitions",
      "Canada, Trans-Canada : entrepôt.",
      "",
      "---",
      "",
      "Transitions Europe – T1 2026",
      "",
      "1. Chiffres clés",
      "Collecte nette : 147 M€",
    ].join("\n");
    const philippe = [
      "- Comète – T1 2026",
      "",
      "1. Chiffres clés",
      "Collecte nette de 132,2 M€",
    ].join("\n");
    const coraliePlain = bulletinMarkdownToPlainEmail(coralie, true, "T1 2026");
    const philippeHtml = bulletinMarkdownToHtml(philippe, true, "T1 2026");
    expect(coraliePlain).not.toMatch(/Comete – T1 2026/);
    expect((coraliePlain.match(/Comète – T1 2026/g) ?? []).length).toBe(1);
    expect((coraliePlain.match(/Transitions Europe – T1 2026/g) ?? []).length).toBe(1);
    expect(philippeHtml).toContain("font-size:1.1em");
    expect(philippeHtml).not.toMatch(/<li[^>]*>[\s\S]*Comète/);
  });
});
