import { getDocumentTypeLabel } from "@/lib/documents/document-type-labels";
import type { DocumentsStatFilter } from "@/lib/documents/documents-page-stats";
import {
  DOCUMENTS_PORTFOLIO_GROUP_LABELS,
  DOCUMENTS_PORTFOLIO_SORT_LABELS,
  type DocumentsPortfolioGroup,
  type DocumentsPortfolioSort,
} from "@/lib/documents/documents-portfolio-utils";

export type DocumentsActiveFilterId =
  | "stat_patrimoine"
  | "stat_identite"
  | "stat_sans_client"
  | "type"
  | "contact"
  | "search"
  | "sort"
  | "group";

export type DocumentsActiveFilterChip = {
  id: DocumentsActiveFilterId;
  label: string;
};

export function buildDocumentsActiveFilterChips(input: {
  statFilter: DocumentsStatFilter | null;
  typeFilter: string;
  contactLabel: string | null;
  searchQuery: string;
  sortKey: DocumentsPortfolioSort;
  groupMode: DocumentsPortfolioGroup;
}): DocumentsActiveFilterChip[] {
  const chips: DocumentsActiveFilterChip[] = [];

  if (input.statFilter === "patrimoine") {
    chips.push({ id: "stat_patrimoine", label: "RIO / patrimoine" });
  }
  if (input.statFilter === "identite") {
    chips.push({ id: "stat_identite", label: "Pièce d'identité" });
  }
  if (input.statFilter === "sans_client") {
    chips.push({ id: "stat_sans_client", label: "Sans client lié" });
  }
  if (input.typeFilter !== "ALL") {
    chips.push({
      id: "type",
      label: getDocumentTypeLabel(input.typeFilter),
    });
  }
  if (input.contactLabel) {
    chips.push({ id: "contact", label: input.contactLabel });
  }
  if (input.searchQuery.trim()) {
    chips.push({
      id: "search",
      label: `Recherche « ${input.searchQuery.trim()} »`,
    });
  }
  if (input.sortKey !== "date_desc") {
    chips.push({
      id: "sort",
      label: `Tri : ${DOCUMENTS_PORTFOLIO_SORT_LABELS[input.sortKey]}`,
    });
  }
  if (input.groupMode !== "flat") {
    chips.push({
      id: "group",
      label: `Regroupement : ${DOCUMENTS_PORTFOLIO_GROUP_LABELS[input.groupMode]}`,
    });
  }

  return chips;
}
