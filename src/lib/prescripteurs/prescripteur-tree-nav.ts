import type { PrescripteurNode } from "@/lib/prescripteurs/prescripteur-tree";

/** Chemin de contact_id depuis la racine (inclus) pour déplier l'arbre. */
export function findPathInPrescripteurTree(
  root: PrescripteurNode,
  targetContactId: number
): number[] | null {
  if (root.contact.id === targetContactId) {
    return [root.contact.id];
  }
  for (const child of root.clientsRecommandes) {
    const sub = findPathInPrescripteurTree(child, targetContactId);
    if (sub) return [root.contact.id, ...sub];
  }
  return null;
}

export function collectAllTreeContactIds(node: PrescripteurNode): number[] {
  const ids = [node.contact.id];
  for (const child of node.clientsRecommandes) {
    ids.push(...collectAllTreeContactIds(child));
  }
  return ids;
}

export function treeContainsContact(
  root: PrescripteurNode,
  contactId: number
): boolean {
  return findPathInPrescripteurTree(root, contactId) != null;
}
