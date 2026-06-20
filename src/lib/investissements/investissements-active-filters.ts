import type { OrigineFilterChip } from "@/lib/investissements/patrimoine-tab-utils";
import {
  INVESTISSEMENT_PORTFOLIO_GROUP_LABELS,
  INVESTISSEMENT_PORTFOLIO_SORT_LABELS,
  type InvestissementPortfolioGroup,
  type InvestissementPortfolioSort,
} from "@/lib/investissements/investissements-portfolio-utils";
import { INVESTISSEMENT_TYPE_FILTER_OPTIONS } from "@/components/investissements/InvestissementMultiFilterSelect";

export type InvestissementActiveFilterId =
  | "sans_vp"
  | "sans_reinvest"
  | "encours_placements"
  | "origine_avec_moi"
  | "origine_a_cote"
  | "search"
  | "types"
  | "partenaires"
  | "sort"
  | "group";

export type InvestissementActiveFilterChip = {
  id: InvestissementActiveFilterId;
  label: string;
};

export function buildInvestissementActiveFilterChips(input: {
  sansVpFilter: boolean;
  sansReinvestFilter: boolean;
  encoursPlacementsFilter: boolean;
  origineFilters: OrigineFilterChip[];
  searchQuery: string;
  typeFilters: string[];
  partenaireFilters: string[];
  sortKey: InvestissementPortfolioSort;
  groupMode: InvestissementPortfolioGroup;
}): InvestissementActiveFilterChip[] {
  const chips: InvestissementActiveFilterChip[] = [];

  if (input.sansVpFilter) {
    chips.push({ id: "sans_vp", label: "AV/PER sans versement programmé" });
  }
  if (input.sansReinvestFilter) {
    chips.push({
      id: "sans_reinvest",
      label: "SCPI sans réinvestissement dividendes",
    });
  }
  if (input.encoursPlacementsFilter) {
    chips.push({ id: "encours_placements", label: "Encours placements — avec moi" });
  }
  if (
    !input.sansVpFilter &&
    !input.sansReinvestFilter &&
    !input.encoursPlacementsFilter &&
    input.origineFilters.includes("avec_moi")
  ) {
    chips.push({ id: "origine_avec_moi", label: "Avec moi" });
  }
  if (
    !input.sansVpFilter &&
    !input.sansReinvestFilter &&
    !input.encoursPlacementsFilter &&
    input.origineFilters.includes("a_cote")
  ) {
    chips.push({ id: "origine_a_cote", label: "À côté" });
  }
  if (input.searchQuery.trim()) {
    chips.push({
      id: "search",
      label: `Recherche « ${input.searchQuery.trim()} »`,
    });
  }
  if (
    !input.sansVpFilter &&
    !input.sansReinvestFilter &&
    !input.encoursPlacementsFilter &&
    input.typeFilters.length > 0
  ) {
    chips.push({
      id: "types",
      label: `Types (${input.typeFilters.length}) : ${input.typeFilters
        .map(
          (f) =>
            INVESTISSEMENT_TYPE_FILTER_OPTIONS.find((o) => o.value === f)
              ?.label ?? f
        )
        .join(", ")}`,
    });
  }
  if (input.partenaireFilters.length > 0) {
    chips.push({
      id: "partenaires",
      label: `Partenaires (${input.partenaireFilters.length})`,
    });
  }
  if (input.sortKey !== "date_desc") {
    chips.push({
      id: "sort",
      label: `Tri : ${INVESTISSEMENT_PORTFOLIO_SORT_LABELS[input.sortKey]}`,
    });
  }
  if (input.groupMode !== "category") {
    chips.push({
      id: "group",
      label: `Regroupement : ${INVESTISSEMENT_PORTFOLIO_GROUP_LABELS[input.groupMode]}`,
    });
  }

  return chips;
}
