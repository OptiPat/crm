import {
  ALERTE_CATEGORY_OPTIONS,
  type AlerteCategoryFilter,
} from "@/lib/alertes/alerte-category";
import type { AlerteUrgencyStatFilter } from "@/lib/alertes/alerte-filters";

export type SuiviAlertesActiveFilterId =
  | "category"
  | "urgency"
  | "search";

export type SuiviAlertesActiveFilterChip = {
  id: SuiviAlertesActiveFilterId;
  label: string;
};

const URGENCY_LABELS: Record<AlerteUrgencyStatFilter, string> = {
  plus30: "+30 j",
  plus7: "+7 j",
  recent: "Cette semaine",
};

export function buildSuiviAlertesActiveFilterChips(opts: {
  categoryFilter: AlerteCategoryFilter;
  urgencyFilter: AlerteUrgencyStatFilter | null;
  searchQuery: string;
}): SuiviAlertesActiveFilterChip[] {
  const chips: SuiviAlertesActiveFilterChip[] = [];

  if (opts.categoryFilter !== "all") {
    const cat = ALERTE_CATEGORY_OPTIONS.find((o) => o.id === opts.categoryFilter);
    chips.push({
      id: "category",
      label: cat?.label ?? opts.categoryFilter,
    });
  }

  if (opts.urgencyFilter != null) {
    chips.push({
      id: "urgency",
      label: URGENCY_LABELS[opts.urgencyFilter],
    });
  }

  const q = opts.searchQuery.trim();
  if (q) {
    chips.push({
      id: "search",
      label: `« ${q} »`,
    });
  }

  return chips;
}
