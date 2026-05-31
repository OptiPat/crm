import type { EtiquetteWithCount } from "@/lib/api/tauri-etiquettes";
import { textMatchesSearch } from "@/lib/search-utils";

export type EtiquettePageFilter =
  | "all"
  | "auto"
  | "manual"
  | "email"
  | "inactive";

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
    if (e.auto_condition_type) autoCount += 1;
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
      return etiquettes.filter((e) => Boolean(e.auto_condition_type));
    case "manual":
      return etiquettes.filter((e) => !e.auto_condition_type);
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

export function countEtiquettesByFilter(
  etiquettes: EtiquetteWithCount[]
): Record<EtiquettePageFilter, number> {
  return {
    all: etiquettes.length,
    auto: etiquettes.filter((e) => e.auto_condition_type).length,
    manual: etiquettes.filter((e) => !e.auto_condition_type).length,
    email: etiquettes.filter((e) => e.email_actif).length,
    inactive: etiquettes.filter((e) => e.actif === false).length,
  };
}
