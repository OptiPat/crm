import { describe, expect, it } from "vitest";
import {
  buildTemplatesEmailActiveFilterChips,
  hasTemplatesEmailActiveFilters,
} from "./templates-email-active-filters";

describe("templates-email-active-filters", () => {
  it("construit les chips actifs", () => {
    expect(
      buildTemplatesEmailActiveFilterChips({
        activationFilter: "trigger",
        categoryFilter: "FISCALITE",
        searchQuery: " IR ",
      })
    ).toEqual([
      { id: "activation", label: "Mode : Déclencheur" },
      { id: "category", label: "Fiscalité" },
      { id: "search", label: "Recherche « IR »" },
    ]);
  });

  it("détecte l'absence de filtres", () => {
    expect(
      hasTemplatesEmailActiveFilters({
        activationFilter: null,
        categoryFilter: "all",
        searchQuery: "",
      })
    ).toBe(false);
    expect(
      hasTemplatesEmailActiveFilters({
        activationFilter: "relance",
        categoryFilter: "all",
        searchQuery: "",
      })
    ).toBe(true);
  });
});
