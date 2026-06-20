import type { EtiquetteWithCount } from "@/lib/api/tauri-etiquettes";
import { textMatchesSearch } from "@/lib/search-utils";

export type EtiquettePageFilter =
  | "all"
  | "auto"
  | "manual"
  | "email"
  | "inactive";

export type EtiquetteSort = "contacts" | "nom" | "priorite" | "recent";

export interface EtiquettesPageStats {
  totalEtiquettes: number;
  activeCount: number;
  autoCount: number;
  manualCount: number;
  emailCount: number;
  contactsTagged: number;
}

export function computeEtiquettesPageStats(
  etiquettes: EtiquetteWithCount[],
  uniqueContactsTagged?: number
): EtiquettesPageStats {
  let activeCount = 0;
  let autoCount = 0;
  let manualCount = 0;
  let emailCount = 0;

  for (const e of etiquettes) {
    if (e.actif !== false) activeCount += 1;
    if (e.auto_condition_type || e.segment_id) autoCount += 1;
    else manualCount += 1;
    if (e.email_actif) emailCount += 1;
  }

  return {
    totalEtiquettes: etiquettes.length,
    activeCount,
    autoCount,
    manualCount,
    emailCount,
    contactsTagged:
      uniqueContactsTagged ??
      etiquettes.reduce((s, e) => s + e.contact_count, 0),
  };
}

export function filterEtiquettesByType(
  etiquettes: EtiquetteWithCount[],
  filter: EtiquettePageFilter
): EtiquetteWithCount[] {
  switch (filter) {
    case "auto":
      return etiquettes.filter((e) => Boolean(e.auto_condition_type) || e.segment_id != null);
    case "manual":
      return etiquettes.filter((e) => !e.auto_condition_type && e.segment_id == null);
    case "email":
      return etiquettes.filter((e) => e.email_actif);
    case "inactive":
      return etiquettes.filter((e) => e.actif === false);
    default:
      return etiquettes;
  }
}

export function filterEtiquettesSearch(
  etiquettes: EtiquetteWithCount[],
  query: string,
  getConditionLabel: (type: string | null) => string
): EtiquetteWithCount[] {
  if (!query.trim()) return etiquettes;
  return etiquettes.filter((e) =>
    textMatchesSearch(
      query,
      e.nom,
      e.description,
      e.auto_condition_type
        ? getConditionLabel(e.auto_condition_type)
        : "manuel"
    )
  );
}

export function sortEtiquettesList(
  etiquettes: EtiquetteWithCount[],
  sort: EtiquetteSort
): EtiquetteWithCount[] {
  const list = [...etiquettes];
  switch (sort) {
    case "nom":
      return list.sort((a, b) =>
        a.nom.localeCompare(b.nom, "fr", { sensitivity: "base" })
      );
    case "priorite":
      return list.sort(
        (a, b) => b.priorite - a.priorite || b.contact_count - a.contact_count
      );
    case "recent":
      return list.sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0));
    case "contacts":
    default:
      return list.sort(
        (a, b) => b.contact_count - a.contact_count || b.priorite - a.priorite
      );
  }
}

export function countEtiquettesByFilter(
  etiquettes: EtiquetteWithCount[]
): Record<EtiquettePageFilter, number> {
  return {
    all: etiquettes.length,
    auto: etiquettes.filter((e) => Boolean(e.auto_condition_type) || e.segment_id != null).length,
    manual: etiquettes.filter((e) => !e.auto_condition_type && e.segment_id == null).length,
    email: etiquettes.filter((e) => e.email_actif).length,
    inactive: etiquettes.filter((e) => e.actif === false).length,
  };
}
