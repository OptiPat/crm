import { describe, expect, it } from "vitest";
import { buildInvestissementActiveFilterChips } from "./investissements-active-filters";
import { INVESTISSEMENTS_PAGE_DEFAULTS } from "./investissements-page-preferences";

const baseInput = {
  sansVpFilter: false,
  sansReinvestFilter: false,
  encoursPlacementsFilter: false,
  origineFilters: [],
  searchQuery: "",
  typeFilters: [],
  partenaireFilters: [],
  sortKey: INVESTISSEMENTS_PAGE_DEFAULTS.sortKey,
  groupMode: INVESTISSEMENTS_PAGE_DEFAULTS.groupMode,
};

describe("buildInvestissementActiveFilterChips", () => {
  it("n'affiche pas de pastille pour le tri et le regroupement par défaut", () => {
    expect(buildInvestissementActiveFilterChips(baseInput)).toEqual([]);
  });

  it("affiche une pastille dès que le tri diffère du tri par défaut", () => {
    const other = INVESTISSEMENTS_PAGE_DEFAULTS.sortKey === "date_desc" ? "client_asc" : "date_desc";
    const chips = buildInvestissementActiveFilterChips({ ...baseInput, sortKey: other });
    expect(chips.map((c) => c.id)).toEqual(["sort"]);
  });
});
