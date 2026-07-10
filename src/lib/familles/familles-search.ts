import { textMatchesSearch } from "@/lib/search-utils";
import type { FamilleGroup } from "@/lib/familles/famille-types";

export type FamilleSortId = "patrimoine_desc" | "membres_desc" | "name_asc";

export type FamilleStatFilter = "all" | "manual" | "auto" | "with_foyer";

export type FamilleSearchResult = {
  groups: FamilleGroup[];
  focusContactId: number | null;
};

export function coreMemberCount(famille: FamilleGroup): number {
  return famille.membres.filter((m) => !m.isSpouse && !m.isFoyerChild).length;
}

export function sortFamilleGroups(
  groups: FamilleGroup[],
  sortId: FamilleSortId
): FamilleGroup[] {
  const copy = [...groups];
  copy.sort((a, b) => {
    switch (sortId) {
      case "membres_desc":
        return coreMemberCount(b) - coreMemberCount(a);
      case "name_asc":
        return a.nom.localeCompare(b.nom, "fr");
      case "patrimoine_desc":
      default:
        return b.patrimoineAvecMoi - a.patrimoineAvecMoi;
    }
  });
  return copy;
}

export function filterFamilleGroupsByStat(
  groups: FamilleGroup[],
  statFilter: FamilleStatFilter
): FamilleGroup[] {
  switch (statFilter) {
    case "manual":
      return groups.filter((g) => g.isManual);
    case "auto":
      return groups.filter((g) => !g.isManual);
    case "with_foyer":
      return groups.filter((g) => g.foyers.length > 0);
    case "all":
    default:
      return groups;
  }
}

/** Recherche par nom de famille ou membre ; surbrillance du membre si match membre. */
export function searchFamilleGroups(
  query: string,
  groups: FamilleGroup[]
): FamilleSearchResult {
  const q = query.trim();
  if (!q) {
    return { groups, focusContactId: null };
  }

  const matched: FamilleGroup[] = [];
  let focusContactId: number | null = null;

  for (const groupe of groups) {
    const nomMatch = textMatchesSearch(q, groupe.nom);
    let memberMatch = false;

    for (const membre of groupe.membres) {
      const c = membre.contact;
      if (
        textMatchesSearch(q, c.prenom, c.nom, `${c.prenom} ${c.nom}`)
      ) {
        memberMatch = true;
        if (focusContactId == null && c.id != null) {
          focusContactId = c.id;
        }
      }
    }

    if (nomMatch || memberMatch) {
      matched.push(groupe);
    }
  }

  return { groups: matched, focusContactId };
}

export function findFamilleKeyForContact(
  contactId: number,
  groups: FamilleGroup[]
): string | null {
  for (const groupe of groups) {
    if (groupe.membres.some((m) => m.contact.id === contactId)) {
      return groupe.key;
    }
  }
  return null;
}
