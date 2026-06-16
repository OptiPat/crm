import { describe, expect, it } from "vitest";
import { contactMatchesSearch, textMatchesSearch } from "./search-utils";

describe("textMatchesSearch", () => {
  it("ignore accents et casse", () => {
    expect(textMatchesSearch("élisabeth", "Elisabeth")).toBe(true);
    expect(textMatchesSearch("nom1", "Jean NOM1")).toBe(true);
  });

  it("chaîne vide = tout correspond", () => {
    expect(textMatchesSearch("", "anything")).toBe(true);
  });

  it("accepte plusieurs mots sur des champs distincts", () => {
    expect(textMatchesSearch("nicolas plaza", "PLAZA", "Nicolas")).toBe(true);
    expect(textMatchesSearch("plaza nicolas", "PLAZA", "Nicolas")).toBe(true);
  });
});

describe("contactMatchesSearch", () => {
  it("cherche dans nom, prénom, email", () => {
    expect(
      contactMatchesSearch("jean", {
        nom: "NOM1",
        prenom: "Jean",
        email: "j@x.fr",
      })
    ).toBe(true);
    expect(
      contactMatchesSearch("j@x", {
        nom: "X",
        prenom: "Y",
        email: "j@x.fr",
      })
    ).toBe(true);
  });

  it("trouve prénom + nom (ordre libre)", () => {
    expect(
      contactMatchesSearch("nicolas plaza", {
        nom: "PLAZA",
        prenom: "Nicolas",
      })
    ).toBe(true);
    expect(
      contactMatchesSearch("plaza nicolas", {
        nom: "PLAZA",
        prenom: "Nicolas",
      })
    ).toBe(true);
  });
});
