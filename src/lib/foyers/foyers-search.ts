import { textMatchesSearch } from "@/lib/search-utils";
import type { Foyer } from "@/lib/api/tauri-foyers";
import type { Contact } from "@/lib/api/tauri-contacts";

export type FoyerSortId = "patrimoine_desc" | "membres_desc" | "name_asc";

export type FoyerStatFilter = "empty" | "with_patrimoine" | "couple";

export type FoyerRow = {
  foyer: Foyer;
  membres: Contact[];
  patrimoineAvecMoi: number;
};

export type FoyerSearchResult = {
  rows: FoyerRow[];
  focusContactId: number | null;
};

export function sortFoyerRows(rows: FoyerRow[], sortId: FoyerSortId): FoyerRow[] {
  const copy = [...rows];
  copy.sort((a, b) => {
    switch (sortId) {
      case "membres_desc":
        return b.membres.length - a.membres.length;
      case "name_asc":
        return a.foyer.nom.localeCompare(b.foyer.nom, "fr");
      case "patrimoine_desc":
      default:
        return b.patrimoineAvecMoi - a.patrimoineAvecMoi;
    }
  });
  return copy;
}

export function filterFoyerRowsByStat(
  rows: FoyerRow[],
  statFilter: FoyerStatFilter | null
): FoyerRow[] {
  if (statFilter == null) return rows;
  switch (statFilter) {
    case "empty":
      return rows.filter((r) => r.membres.length === 0);
    case "with_patrimoine":
      return rows.filter((r) => r.patrimoineAvecMoi > 0);
    case "couple":
      return rows.filter((r) => r.foyer.type_foyer === "COUPLE");
    default:
      return rows;
  }
}

export function filterFoyerRowsByType(
  rows: FoyerRow[],
  typeFilter: string
): FoyerRow[] {
  if (typeFilter === "ALL") return rows;
  return rows.filter((r) => r.foyer.type_foyer === typeFilter);
}

/** Recherche par nom de foyer ou membre ; surbrillance du membre si match membre. */
export function searchFoyerRows(query: string, rows: FoyerRow[]): FoyerSearchResult {
  const q = query.trim();
  if (!q) {
    return { rows, focusContactId: null };
  }

  const matched: FoyerRow[] = [];
  let focusContactId: number | null = null;

  for (const row of rows) {
    const nomMatch = textMatchesSearch(q, row.foyer.nom);
    let memberMatch = false;

    for (const contact of row.membres) {
      if (textMatchesSearch(q, contact.prenom, contact.nom, `${contact.prenom} ${contact.nom}`)) {
        memberMatch = true;
        if (focusContactId == null && contact.id != null) {
          focusContactId = contact.id;
        }
      }
    }

    if (nomMatch || memberMatch) {
      matched.push(row);
    }
  }

  return { rows: matched, focusContactId };
}

export function findFoyerIdForContact(
  contactId: number,
  rows: FoyerRow[]
): number | null {
  for (const row of rows) {
    if (row.membres.some((m) => m.id === contactId)) {
      return row.foyer.id;
    }
  }
  return null;
}
