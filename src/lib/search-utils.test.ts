import { describe, expect, it } from "vitest";
import { contactMatchesSearch, textMatchesSearch } from "./search-utils";

describe("textMatchesSearch", () => {
  it("ignore accents et casse", () => {
    expect(textMatchesSearch("élisabeth", "Elisabeth NOM2")).toBe(true);
    expect(textMatchesSearch("dupont", "Jean DUPONT")).toBe(true);
  });

  it("chaîne vide = tout correspond", () => {
    expect(textMatchesSearch("", "anything")).toBe(true);
  });
});

describe("contactMatchesSearch", () => {
  it("cherche dans nom, prénom, email", () => {
    expect(
      contactMatchesSearch("arnaud", {
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
});
