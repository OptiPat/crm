import type { Contact } from "@/lib/api/tauri-contacts";
import { contactMatchesSearch } from "@/lib/search-utils";
import {
  getContactDisplayName,
  matchesContactOrFoyer,
  type FoyerInfo,
  type PrescripteurNode,
  type PrescripteurStats,
} from "@/lib/prescripteurs/prescripteur-tree";
import { findPathInPrescripteurTree } from "@/lib/prescripteurs/prescripteur-tree-nav";
export type PrescripteurSortId = "patrimoine_desc" | "clients_desc" | "name_asc";

export type PrescripteurStatFilter = "all" | "with_clients" | "zero_clients";

export type PrescripteurSearchResult = {
  roots: PrescripteurStats[];
  focusContactId: number | null;
};


export function getPrescripteurRacineIds(racines: PrescripteurStats[]): Set<number> {
  return new Set(racines.map((r) => r.contact.id));
}

/** Remonte la chaîne prescripteur_id jusqu'à une racine connue. */
export function findPrescripteurRacineId(
  contactId: number,
  contacts: Contact[],
  racineIds: Set<number>
): number | null {
  const byId = new Map(contacts.map((c) => [c.id, c]));
  let current = byId.get(contactId);
  const visited = new Set<number>();
  while (current) {
    if (racineIds.has(current.id)) return current.id;
    if (!current.prescripteur_id || visited.has(current.prescripteur_id)) break;
    visited.add(current.id);
    current = byId.get(current.prescripteur_id);
  }
  return racineIds.has(contactId) ? contactId : null;
}

export function sortPrescripteurRoots(
  roots: PrescripteurStats[],
  sortId: PrescripteurSortId,
  foyersInfo: Record<number, FoyerInfo>
): PrescripteurStats[] {
  const copy = [...roots];
  copy.sort((a, b) => {
    switch (sortId) {
      case "clients_desc":
        return b.nombreClientsTotal - a.nombreClientsTotal;
      case "name_asc": {
        const na = getContactDisplayName(a.contact, foyersInfo);
        const nb = getContactDisplayName(b.contact, foyersInfo);
        return na.localeCompare(nb, "fr");
      }
      case "patrimoine_desc":
      default:
        return b.patrimoineApporteTotal - a.patrimoineApporteTotal;
    }
  });
  return copy;
}

export function filterPrescripteurRootsByStat(
  roots: PrescripteurStats[],
  statFilter: PrescripteurStatFilter
): PrescripteurStats[] {
  if (statFilter === "with_clients") {
    return roots.filter((r) => r.nombreClientsTotal > 0);
  }
  if (statFilter === "zero_clients") {
    return roots.filter((r) => r.nombreClientsTotal === 0);
  }
  return roots;
}

/**
 * Recherche globale : racines + tout contact du réseau.
 * Retourne les racines à afficher et éventuellement un contact à surligner.
 */
export function searchPrescripteurRoots(
  query: string,
  racines: PrescripteurStats[],
  contacts: Contact[],
  foyersInfo: Record<number, FoyerInfo>
): PrescripteurSearchResult {  const q = query.trim();
  if (!q) {
    return { roots: racines, focusContactId: null };
  }

  const racineIds = getPrescripteurRacineIds(racines);
  const matchedRootIds = new Set<number>();
  let focusContactId: number | null = null;

  for (const stats of racines) {
    if (matchesContactOrFoyer(stats.contact, q, foyersInfo)) {
      matchedRootIds.add(stats.contact.id);
    }
  }

  for (const contact of contacts) {
    if (!contactMatchesSearch(q, contact)) continue;
    const rootId = findPrescripteurRacineId(contact.id, contacts, racineIds);
    if (rootId != null) {
      matchedRootIds.add(rootId);
      if (focusContactId == null && contact.id !== rootId) {
        focusContactId = contact.id;
      }
    }
  }

  const roots = racines.filter((r) => matchedRootIds.has(r.contact.id));
  return { roots, focusContactId };
}

export function expandPathForContact(
  root: PrescripteurNode,
  focusContactId: number | null
): number[] {
  if (focusContactId == null) {
    return [root.contact.id];
  }
  return findPathInPrescripteurTree(root, focusContactId) ?? [root.contact.id];
}
