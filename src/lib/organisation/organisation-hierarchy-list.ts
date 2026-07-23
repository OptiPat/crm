import type { Contact } from "@/lib/api/tauri-contacts";
import type { OrganisationVolumeRow } from "@/lib/organisation/organisation-branch-volumes";
import {
  indexContactsById,
  indexDownlineByParrain,
  isOrganisationActifFilleul,
  type OrganisationTreeResult,
} from "@/lib/organisation/organisation-tree";

export type OrganisationHierarchyNodeStatus = "self" | "actif" | "desinscrit" | "upline";

export type OrganisationHierarchyNode = {
  contact: Contact;
  generation: number;
  status: OrganisationHierarchyNodeStatus;
  label: string;
  ownVolume: number;
  branchVolume: number;
  descendantCount: number;
  children: OrganisationHierarchyNode[];
};

export type OrganisationHierarchyList = {
  upline: OrganisationHierarchyNode[];
  root: OrganisationHierarchyNode | null;
  desinscrits: OrganisationHierarchyNode[];
};

function contactLabel(contact: Contact, suffix = ""): string {
  const base = `${contact.prenom ?? ""} ${contact.nom ?? ""}`.trim();
  return suffix ? `${base} ${suffix}` : base;
}

function compareContactsByPrenom(a: Contact, b: Contact): number {
  const prenomA = a.prenom.toLocaleLowerCase("fr");
  const prenomB = b.prenom.toLocaleLowerCase("fr");
  if (prenomA !== prenomB) return prenomA.localeCompare(prenomB, "fr");
  return a.nom.toLocaleLowerCase("fr").localeCompare(b.nom.toLocaleLowerCase("fr"), "fr");
}

function countDescendants(node: OrganisationHierarchyNode): number {
  return node.children.reduce((sum, child) => sum + 1 + countDescendants(child), 0);
}

function buildActiveChildNodes(
  parrainId: number,
  generation: number,
  byParrain: Map<number, Contact[]>,
  volumeByContactId: Map<number, OrganisationVolumeRow>
): OrganisationHierarchyNode[] {
  const children = (byParrain.get(parrainId) ?? []).filter(isOrganisationActifFilleul);
  children.sort(compareContactsByPrenom);

  return children.map((contact) => {
    const childNodes = buildActiveChildNodes(
      contact.id,
      generation + 1,
      byParrain,
      volumeByContactId
    );
    const volumes = volumeByContactId.get(contact.id);
    const node: OrganisationHierarchyNode = {
      contact,
      generation,
      status: "actif",
      label: contactLabel(contact),
      ownVolume: volumes?.ownVolume ?? 0,
      branchVolume: volumes?.branchVolume ?? 0,
      descendantCount: 0,
      children: childNodes,
    };
    node.descendantCount = countDescendants(node);
    return node;
  });
}

export function indexOrganisationVolumeRowsByContactId(
  rows: OrganisationVolumeRow[]
): Map<number, OrganisationVolumeRow> {
  const map = new Map<number, OrganisationVolumeRow>();
  for (const row of rows) {
    map.set(row.contactId, row);
  }
  return map;
}

export function buildOrganisationHierarchyList(
  tree: OrganisationTreeResult,
  contacts: Contact[],
  volumeRows: OrganisationVolumeRow[]
): OrganisationHierarchyList {
  const volumeByContactId = indexOrganisationVolumeRowsByContactId(volumeRows);
  const byParrain = indexDownlineByParrain(contacts);

  const upline: OrganisationHierarchyNode[] = tree.upline.map((node) => {
    const volumes = volumeByContactId.get(node.contact.id);
    return {
      contact: node.contact,
      generation: 0,
      status: "upline",
      label: contactLabel(node.contact),
      ownVolume: volumes?.ownVolume ?? 0,
      branchVolume: volumes?.branchVolume ?? 0,
      descendantCount: 0,
      children: [],
    };
  });

  let root: OrganisationHierarchyNode | null = null;
  if (tree.selfContact) {
    const selfVolumes = volumeByContactId.get(tree.selfContact.id);
    const children = buildActiveChildNodes(
      tree.selfContact.id,
      1,
      byParrain,
      volumeByContactId
    );
    root = {
      contact: tree.selfContact,
      generation: 0,
      status: "self",
      label: contactLabel(tree.selfContact, "(vous)"),
      ownVolume: selfVolumes?.ownVolume ?? 0,
      branchVolume: selfVolumes?.branchVolume ?? 0,
      descendantCount: 0,
      children,
    };
    root.descendantCount = countDescendants(root);
  }

  const desinscrits: OrganisationHierarchyNode[] = tree.desinscrits.map((entry) => {
    const volumes = volumeByContactId.get(entry.contact.id);
    return {
      contact: entry.contact,
      generation: entry.generation,
      status: "desinscrit",
      label: contactLabel(entry.contact),
      ownVolume: volumes?.ownVolume ?? 0,
      branchVolume: volumes?.branchVolume ?? 0,
      descendantCount: 0,
      children: [],
    };
  });

  return { upline, root, desinscrits };
}

/** Ids à déplier pour rendre visible un consultant dans la liste (chemin jusqu'à la racine). */
export function collectHierarchyExpandIdsToContact(
  contactId: number,
  selfContactId: number | null,
  contacts: Contact[]
): number[] {
  if (selfContactId == null) return [];
  const byId = indexContactsById(contacts);
  const ids = new Set<number>([selfContactId]);
  let current = byId.get(contactId);
  const visited = new Set<number>();

  while (current && current.id !== selfContactId) {
    const parrainId = current.parrain_id;
    if (parrainId == null || visited.has(parrainId)) break;
    visited.add(parrainId);
    ids.add(parrainId);
    current = byId.get(parrainId);
  }

  return [...ids];
}

export type HierarchyFocusZone = "active" | "upline" | "desinscrit";

/** Zone d'affichage d'un contact dans la liste pilotage. */
export function resolveHierarchyFocusZone(
  contactId: number,
  list: OrganisationHierarchyList
): HierarchyFocusZone | null {
  if (list.upline.some((node) => node.contact.id === contactId)) return "upline";
  if (list.desinscrits.some((node) => node.contact.id === contactId)) return "desinscrit";
  if (contactId === list.root?.contact.id) return "active";
  const walk = (node: OrganisationHierarchyNode): boolean => {
    if (node.contact.id === contactId) return true;
    return node.children.some(walk);
  };
  if (list.root && walk(list.root)) return "active";
  return null;
}

/** Déplié par défaut : vous + filleuls directs (niveau 1). */
export function defaultHierarchyExpandedIds(list: OrganisationHierarchyList): Set<number> {
  const ids = new Set<number>();
  if (list.root?.contact.id != null) {
    ids.add(list.root.contact.id);
    for (const child of list.root.children) {
      if (child.contact.id != null) ids.add(child.contact.id);
    }
  }
  return ids;
}

/** Déplier tous les nœuds jusqu'à un niveau de génération inclus. */
export function expandHierarchyToGeneration(
  root: OrganisationHierarchyNode | null,
  maxGeneration: number
): Set<number> {
  const ids = new Set<number>();
  const walk = (node: OrganisationHierarchyNode) => {
    if (node.contact.id != null) ids.add(node.contact.id);
    if (node.generation < maxGeneration) {
      for (const child of node.children) walk(child);
    }
  };
  if (root) walk(root);
  return ids;
}

export function collectAllHierarchyNodeIds(root: OrganisationHierarchyNode | null): Set<number> {
  const ids = new Set<number>();
  const walk = (node: OrganisationHierarchyNode) => {
    if (node.contact.id != null) ids.add(node.contact.id);
    for (const child of node.children) walk(child);
  };
  if (root) walk(root);
  return ids;
}
