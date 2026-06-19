import { describe, expect, it } from "vitest";
import {
  expectedPartenaireForRioLabel,
  resolvePartenaireIdForRioLabel,
  scoreRioPartenaireProductMatch,
} from "./rio-product-partenaire";
import type { Partenaire } from "@/lib/api/tauri-partenaires";

describe("rio-product-partenaire", () => {
  it("mappe les libellés Stellium vers le partenaire attendu", () => {
    expect(expectedPartenaireForRioLabel("Cristalliance Avenir")).toBe("vie plus");
    expect(expectedPartenaireForRioLabel("Cristalliance Evoluvie")).toBe("apicil");
    expect(expectedPartenaireForRioLabel("PERtinence Retraite")).toBe("vie plus");
  });

  it("ignore accents et casse", () => {
    expect(expectedPartenaireForRioLabel("CRISTALLIANCE ÉVOLUVIE")).toBe("apicil");
    expect(expectedPartenaireForRioLabel("Pertinence retraite")).toBe("vie plus");
  });

  it("score élevé si le partenaire CRM correspond", () => {
    expect(
      scoreRioPartenaireProductMatch("Cristalliance Avenir", "Contrat AV", "Vie Plus")
    ).toBe(75);
    expect(
      scoreRioPartenaireProductMatch("Cristalliance Evoluvie", "AV", "Apicil")
    ).toBe(75);
  });

  it("score intermédiaire si le nom produit CRM porte le partenaire", () => {
    expect(
      scoreRioPartenaireProductMatch("PERtinence Retraite", "Vie Plus PER", null)
    ).toBe(60);
  });

  it("ne score pas un libellé RIO inconnu", () => {
    expect(expectedPartenaireForRioLabel("Generali Patrimoine")).toBeNull();
    expect(scoreRioPartenaireProductMatch("Generali Patrimoine", "AV", "Apicil")).toBe(0);
  });

  it("résout l'id partenaire CRM pour un libellé Stellium", () => {
    const partenaires = [
      { id: 1, raison_sociale: "Vie Plus" },
      { id: 2, raison_sociale: "Apicil" },
    ] as Partenaire[];
    expect(resolvePartenaireIdForRioLabel("Cristalliance Avenir", partenaires)).toBe(1);
    expect(resolvePartenaireIdForRioLabel("Cristalliance Evoluvie", partenaires)).toBe(2);
    expect(resolvePartenaireIdForRioLabel("Livret A", partenaires)).toBeNull();
  });
});
