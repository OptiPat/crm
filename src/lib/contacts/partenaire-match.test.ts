import { describe, it, expect } from "vitest";
import type { Partenaire } from "@/lib/api/tauri-partenaires";
import {
  deduireTypePartenaire,
  findMatchingPartenaire,
  normalizeString,
} from "./partenaire-match";

const p = (raison_sociale: string): Partenaire =>
  ({ raison_sociale }) as Partenaire;

const partenaires = [
  p("Vie Plus"),
  p("Apicil"),
  p("Swiss Life"),
  p("Corum"),
];

describe("normalizeString", () => {
  it("retire accents, casse et caractères spéciaux", () => {
    expect(normalizeString("Épargne-Pierre+")).toBe("epargne pierre");
  });
});

describe("findMatchingPartenaire", () => {
  it("correspondance exacte après normalisation", () => {
    expect(findMatchingPartenaire("vie plus", partenaires)?.raison_sociale).toBe("Vie Plus");
  });

  it("reconnaît un alias connu", () => {
    expect(findMatchingPartenaire("vie+", partenaires)?.raison_sociale).toBe("Vie Plus");
    expect(findMatchingPartenaire("swisslife", partenaires)?.raison_sociale).toBe("Swiss Life");
  });

  it("tolère une faute de frappe (Levenshtein)", () => {
    expect(findMatchingPartenaire("Apcil", partenaires)?.raison_sociale).toBe("Apicil");
  });

  it("retourne null si rien de proche", () => {
    expect(findMatchingPartenaire("ZZZ Inconnu XYZ", partenaires)).toBeNull();
  });
});

describe("deduireTypePartenaire", () => {
  it("assurance vie -> ASSUREUR", () => {
    expect(deduireTypePartenaire("Assurance Vie")).toBe("ASSUREUR");
    expect(deduireTypePartenaire("PER")).toBe("ASSUREUR");
  });
  it("immobilier -> PROMOTEUR", () => {
    expect(deduireTypePartenaire("Pinel")).toBe("PROMOTEUR");
    expect(deduireTypePartenaire("DENORMANDIE")).toBe("PROMOTEUR");
  });
  it("contrat capitalisation -> ASSUREUR", () => {
    expect(deduireTypePartenaire("CONTRAT_CAPITALISATION")).toBe("ASSUREUR");
  });
  it("FIP/FCPI -> SOCIETE_GESTION_FIP", () => {
    expect(deduireTypePartenaire("FCPI")).toBe("SOCIETE_GESTION_FIP");
  });
  it("défaut -> SOCIETE_GESTION_SCPI", () => {
    expect(deduireTypePartenaire("SCPI")).toBe("SOCIETE_GESTION_SCPI");
  });
});
