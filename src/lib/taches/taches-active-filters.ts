import type { TachePriorite } from "@/lib/api/tauri-taches";
import { PRIORITE_META } from "@/lib/taches/tache-display";
import type {
  TacheEcheanceFilter,
  TacheStatutFilter,
} from "@/lib/taches/tache-filters";

export type TachesActiveFilterId =
  | "echeance"
  | "statut"
  | "priorite"
  | "contact"
  | "search";

export type TachesActiveFilterChip = {
  id: TachesActiveFilterId;
  label: string;
};

const ECHEANCE_LABELS: Record<TacheEcheanceFilter, string> = {
  overdue: "En retard",
  today: "Aujourd'hui",
  week: "Demain / semaine",
  none: "Sans date",
  urgent: "Aujourd'hui / en retard",
};

const STATUT_LABELS: Record<TacheStatutFilter, string> = {
  ACTIVES: "À faire",
  FAITES: "Faites",
  TOUTES: "Toutes",
};

export function buildTachesActiveFilterChips(input: {
  statutFilter: TacheStatutFilter;
  echeanceFilter: TacheEcheanceFilter | null;
  searchQuery: string;
  prioriteFilter: TachePriorite | "all";
  contactLabel: string | null;
}): TachesActiveFilterChip[] {
  const chips: TachesActiveFilterChip[] = [];

  if (input.echeanceFilter) {
    chips.push({
      id: "echeance",
      label: ECHEANCE_LABELS[input.echeanceFilter],
    });
  }
  if (input.statutFilter !== "ACTIVES") {
    chips.push({
      id: "statut",
      label: STATUT_LABELS[input.statutFilter],
    });
  }
  if (input.prioriteFilter !== "all") {
    chips.push({
      id: "priorite",
      label: PRIORITE_META[input.prioriteFilter].label,
    });
  }
  if (input.contactLabel) {
    chips.push({
      id: "contact",
      label: input.contactLabel,
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

export function hasTachesActiveFilters(input: {
  statutFilter: TacheStatutFilter;
  echeanceFilter: TacheEcheanceFilter | null;
  searchQuery: string;
  prioriteFilter: TachePriorite | "all";
  contactIdFilter: number | null;
}): boolean {
  return (
    input.echeanceFilter != null ||
    input.statutFilter !== "ACTIVES" ||
    input.prioriteFilter !== "all" ||
    input.contactIdFilter != null ||
    input.searchQuery.trim().length > 0
  );
}
