import type { Contact } from "@/lib/api/tauri-contacts";
import { isOrganisationActifFilleul } from "@/lib/organisation/organisation-tree";

/** Génération filleul (1 = directs) à partir de laquelle on replie (5 inclus, sous le parrain niv. 4). */
export const ORGANISATION_COLLAPSE_DEPTH = 5;

export function isDeepBranchCollapsed(
  depth: number,
  descendantCount: number,
  expanded: boolean
): boolean {
  return (
    depth === ORGANISATION_COLLAPSE_DEPTH - 1 &&
    descendantCount > 0 &&
    !expanded
  );
}

export function countActiveDescendants(
  parrainId: number,
  byParrain: Map<number, Contact[]>
): number {
  let total = 0;
  const stack = [...(byParrain.get(parrainId) ?? [])].filter(isOrganisationActifFilleul);

  while (stack.length > 0) {
    const current = stack.pop()!;
    total += 1;
    for (const child of byParrain.get(current.id) ?? []) {
      if (isOrganisationActifFilleul(child)) stack.push(child);
    }
  }

  return total;
}
