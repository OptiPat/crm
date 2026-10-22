import { describe, expect, it } from "vitest";
import { filterByContactSearch, matchesContactSearch } from "./pipe-contact-search";

describe("matchesContactSearch", () => {
  const row = { contact_prenom: "Hélène", contact_nom: "DUPONT" };

  it("ignore accents et casse", () => {
    expect(matchesContactSearch(row, "helene")).toBe(true);
    expect(matchesContactSearch(row, "dup")).toBe(true);
  });

  it("exige tous les mots", () => {
    expect(matchesContactSearch(row, "dupont hel")).toBe(true);
    expect(matchesContactSearch(row, "dupont martin")).toBe(false);
  });

  it("cherche aussi le co-contact", () => {
    expect(
      matchesContactSearch(
        { ...row, secondary_contact_prenom: "Marc", secondary_contact_nom: "Durand" },
        "durand"
      )
    ).toBe(true);
  });

  it("recherche vide = tout", () => {
    const rows = [row, { contact_nom: null, contact_prenom: null }];
    expect(filterByContactSearch(rows, "  ")).toBe(rows);
    expect(filterByContactSearch(rows, "dupont")).toEqual([row]);
  });
});
