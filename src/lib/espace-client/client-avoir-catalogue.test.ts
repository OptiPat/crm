import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  AVOIR_TYPES_PAR_PANIER,
  AVOIR_TYPES_UNIQUES,
  isTypeAutorisePourPanier,
  optionAvoirParValeur,
  panierEstImmobilier,
  panierEstScpi,
  panierAccepteLienExtranet,
} from "./client-avoir-catalogue";

function lireListeRust(fichier: string, nom: string): string[] {
  const source = readFileSync(fichier, "utf8");
  const bloc = source.match(
    new RegExp(`pub const ${nom}: \\[&str; \\d+\\] = \\[([\\s\\S]*?)\\];`)
  );
  if (!bloc) {
    throw new Error(`${nom} introuvable dans ${fichier}`);
  }
  return [...bloc[1].matchAll(/"([A-Z_]+)"/g)].map((m) => m[1]).sort();
}

describe("catalogue avoirs client", () => {
  it("n'autorise un type que dans son panier", () => {
    expect(isTypeAutorisePourPanier("placements", "PER")).toBe(true);
    expect(isTypeAutorisePourPanier("immobilier", "PER")).toBe(false);
    expect(isTypeAutorisePourPanier("scpi", "SCPI_DEMEMBREMENT")).toBe(true);
    expect(isTypeAutorisePourPanier("epargne", "CAT")).toBe(true);
    expect(isTypeAutorisePourPanier("epargne", "PEAC")).toBe(true);
    expect(isTypeAutorisePourPanier("meubles", "BIJOUX")).toBe(true);
    expect(isTypeAutorisePourPanier("placements", "BIJOUX")).toBe(false);
  });

  it("classe immobilier et SCPI selon le panier, pas une liste CRM", () => {
    expect(panierEstImmobilier("immobilier")).toBe(true);
    expect(panierEstScpi("scpi")).toBe(true);
    expect(panierEstImmobilier("scpi")).toBe(false);
    expect(panierEstScpi("immobilier")).toBe(false);
  });

  it("réserve le lien extranet aux paniers financiers", () => {
    expect(panierAccepteLienExtranet("placements")).toBe(true);
    expect(panierAccepteLienExtranet("scpi")).toBe(true);
    expect(panierAccepteLienExtranet("epargne")).toBe(true);
    expect(panierAccepteLienExtranet("immobilier")).toBe(false);
    expect(panierAccepteLienExtranet("meubles")).toBe(false);
  });

  it("Autre immobilier reste dans le camembert immobilier", () => {
    const autre = AVOIR_TYPES_PAR_PANIER.immobilier.find((o) => o.label === "Autre");
    expect(autre?.typeProduit).toBe("IMMOBILIER");
  });

  it("mappe PEE et PERCOL vers épargne salariale avec un nom figé", () => {
    const pee = optionAvoirParValeur("placements", "EPARGNE_SALARIALE_PEE");
    const percol = optionAvoirParValeur("placements", "EPARGNE_SALARIALE_PERCOL");
    expect(pee).toMatchObject({
      typeProduit: "EPARGNE_SALARIALE",
      nomImplicite: "PEE",
    });
    expect(percol).toMatchObject({
      typeProduit: "EPARGNE_SALARIALE",
      nomImplicite: "PERCOL",
    });
    expect(isTypeAutorisePourPanier("placements", "EPARGNE_SALARIALE")).toBe(true);
    expect(AVOIR_TYPES_PAR_PANIER.placements.some((o) => o.label === "Épargne Salariale")).toBe(
      true
    );
  });

  it("les listes Rust du CRM et du portail sont identiques au catalogue TS", () => {
    const crm = resolve(
      __dirname,
      "../../../src-tauri/src/espace_client/avoir_catalogue.rs"
    );
    const portail = resolve(
      __dirname,
      "../../../espace-portail/src/avoir_catalogue.rs"
    );
    const attendu = [...AVOIR_TYPES_UNIQUES].sort();
    expect(lireListeRust(crm, "AVOIR_TYPES_AUTORISES")).toEqual(attendu);
    expect(lireListeRust(portail, "AVOIR_TYPES_AUTORISES")).toEqual(attendu);
  });
});
