import { getTemplateCategoryMeta } from "@/lib/emails/template-email-meta";
import {
  TEMPLATE_ACTIVATION_MODE_LABELS,
  type TemplateActivationStatFilter,
} from "@/lib/emails/template-email-activation";

export type TemplatesEmailActiveFilterId =
  | "activation"
  | "category"
  | "search";

export type TemplatesEmailActiveFilterChip = {
  id: TemplatesEmailActiveFilterId;
  label: string;
};

export function buildTemplatesEmailActiveFilterChips(input: {
  activationFilter: TemplateActivationStatFilter | null;
  categoryFilter: string;
  searchQuery: string;
}): TemplatesEmailActiveFilterChip[] {
  const chips: TemplatesEmailActiveFilterChip[] = [];

  if (input.activationFilter) {
    chips.push({
      id: "activation",
      label: `Mode : ${TEMPLATE_ACTIVATION_MODE_LABELS[input.activationFilter]}`,
    });
  }
  if (input.categoryFilter !== "all") {
    chips.push({
      id: "category",
      label: getTemplateCategoryMeta(input.categoryFilter).label,
    });
  }
  if (input.searchQuery.trim()) {
    chips.push({
      id: "search",
      label: `Recherche « ${input.searchQuery.trim()} »`,
    });
  }

  return chips;
}

export function hasTemplatesEmailActiveFilters(input: {
  activationFilter: TemplateActivationStatFilter | null;
  categoryFilter: string;
  searchQuery: string;
}): boolean {
  return buildTemplatesEmailActiveFilterChips(input).length > 0;
}
