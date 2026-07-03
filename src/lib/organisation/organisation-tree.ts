import type { Contact } from "@/lib/api/tauri-contacts";
import type { CgpConfig } from "@/lib/api/tauri-settings";
import { findContactByNameKeyWithSwap } from "@/lib/contacts/name-match";

/** Filleuls visibles dans l'arbre (pas les prospects / suspects). */
export function isOrganisationDownlineMember(contact: Contact): boolean {
  return (
    contact.filleul_categorie === "FILLEUL" ||
    contact.filleul_categorie === "FILLEUL_DESINSCRIT"
  );
}

export function isOrganisationActifFilleul(contact: Contact): boolean {
  return contact.filleul_categorie === "FILLEUL";
}

export function isOrganisationDesinscrit(contact: Contact): boolean {
  return contact.filleul_categorie === "FILLEUL_DESINSCRIT";
}

export type OrganisationDownlineNode = {
  contact: Contact;
  generation: number;
  parrainId: number | null;
  parrainLabel: string;
};

export type OrganisationUplineNode = {
  contact: Contact;
  isDesinscrit: boolean;
  level: number;
};

export type OrganisationDesinscritEntry = {
  contact: Contact;
  generation: number;
  parrainId: number | null;
  parrainLabel: string;
};

export type OrganisationTreeResult = {
  selfContact: Contact | null;
  selfDisplayName: string;
  upline: OrganisationUplineNode[];
  /** Générations 1, 2, 3… — filleuls actifs uniquement, chaque couche = un niveau. */
  generations: OrganisationDownlineNode[][];
  desinscrits: OrganisationDesinscritEntry[];
  stats: {
    actifs: number;
    desinscrits: number;
    total: number;
  };
};

export function resolveOrganisationSelfContact(
  contacts: Contact[],
  cgp: Pick<CgpConfig, "nom" | "prenom">
): Contact | null {
  const nom = cgp.nom?.trim();
  const prenom = cgp.prenom?.trim();
  if (!nom || !prenom) return null;
  return findContactByNameKeyWithSwap(contacts, nom, prenom) ?? null;
}

export function buildOrganisationSelfDisplayName(
  cgp: Pick<CgpConfig, "nom" | "prenom">,
  selfContact: Contact | null
): string {
  if (selfContact) {
    return `${selfContact.prenom} ${selfContact.nom}`.trim();
  }
  const fromCgp = [cgp.prenom, cgp.nom].filter(Boolean).join(" ").trim();
  return fromCgp || "Conseiller";
}

export function indexContactsById(contacts: Contact[]): Map<number, Contact> {
  const map = new Map<number, Contact>();
  for (const c of contacts) {
    if (c.id != null) map.set(c.id, c);
  }
  return map;
}

export function indexDownlineByParrain(contacts: Contact[]): Map<number, Contact[]> {
  const map = new Map<number, Contact[]>();
  for (const c of contacts) {
    if (!isOrganisationDownlineMember(c) || c.parrain_id == null) continue;
    const list = map.get(c.parrain_id) ?? [];
    list.push(c);
    map.set(c.parrain_id, list);
  }
  for (const list of map.values()) {
    list.sort(compareOrganisationContactsByPrenom);
  }
  return map;
}

function compareOrganisationContactsByPrenom(a: Contact, b: Contact): number {
  const prenomA = a.prenom.toLocaleLowerCase("fr");
  const prenomB = b.prenom.toLocaleLowerCase("fr");
  if (prenomA !== prenomB) return prenomA.localeCompare(prenomB, "fr");
  return a.nom.toLocaleLowerCase("fr").localeCompare(b.nom.toLocaleLowerCase("fr"), "fr");
}

function contactDisplayLabel(contact: Contact): string {
  return `${contact.prenom} ${contact.nom}`.trim();
}

export function buildOrganisationUpline(
  selfContact: Contact,
  byId: Map<number, Contact>
): OrganisationUplineNode[] {
  const chain: OrganisationUplineNode[] = [];
  const visited = new Set<number>([selfContact.id]);
  let currentId = selfContact.parrain_id ?? null;
  let level = 1;

  while (currentId != null) {
    if (visited.has(currentId)) break;
    visited.add(currentId);
    const contact = byId.get(currentId);
    if (!contact) break;
    chain.push({
      contact,
      isDesinscrit: isOrganisationDesinscrit(contact),
      level,
    });
    currentId = contact.parrain_id ?? null;
    level += 1;
  }

  return chain.reverse();
}

/** Couches horizontales de filleuls actifs (gén. 1 = directs au-dessus de moi). */
export function buildActifGenerationLayers(
  selfContact: Contact,
  byParrain: Map<number, Contact[]>,
  byId: Map<number, Contact>
): OrganisationDownlineNode[][] {
  const layers: OrganisationDownlineNode[][] = [];
  let currentParrainIds = [selfContact.id];
  let generation = 1;
  const visited = new Set<number>([selfContact.id]);

  while (currentParrainIds.length > 0) {
    const layer: OrganisationDownlineNode[] = [];
    const nextParrainIds: number[] = [];

    for (const parrainId of currentParrainIds) {
      for (const child of byParrain.get(parrainId) ?? []) {
        if (!isOrganisationActifFilleul(child) || visited.has(child.id)) continue;
        visited.add(child.id);
        layer.push({
          contact: child,
          generation,
          parrainId: child.parrain_id ?? null,
          parrainLabel: resolveParrainLabel(
            child.parrain_id ?? null,
            selfContact.id,
            byId
          ),
        });
        nextParrainIds.push(child.id);
      }
    }

    if (layer.length === 0) break;
    layer.sort((a, b) => {
      const parrainCmp = a.parrainLabel.localeCompare(b.parrainLabel, "fr");
      if (parrainCmp !== 0) return parrainCmp;
      return compareOrganisationContactsByPrenom(a.contact, b.contact);
    });
    layers.push(layer);
    currentParrainIds = nextParrainIds;
    generation += 1;
  }

  return layers;
}

/** Tous les désinscrits sous moi (toutes générations), hors arbre principal. */
export function collectOrganisationDesinscrits(
  selfContact: Contact,
  byParrain: Map<number, Contact[]>,
  byId: Map<number, Contact>
): OrganisationDesinscritEntry[] {
  const entries: OrganisationDesinscritEntry[] = [];
  const queue: { parrainId: number; generation: number }[] = [
    { parrainId: selfContact.id, generation: 1 },
  ];
  const visited = new Set<number>();

  while (queue.length > 0) {
    const { parrainId, generation } = queue.shift()!;
    for (const child of byParrain.get(parrainId) ?? []) {
      if (visited.has(child.id)) continue;
      visited.add(child.id);

      if (isOrganisationDesinscrit(child)) {
        entries.push({
          contact: child,
          generation,
          parrainId: child.parrain_id ?? null,
          parrainLabel: resolveParrainLabel(child.parrain_id ?? null, selfContact.id, byId),
        });
      }

      if (isOrganisationDownlineMember(child)) {
        queue.push({ parrainId: child.id, generation: generation + 1 });
      }
    }
  }

  entries.sort((a, b) => {
    const parrainCmp = a.parrainLabel.localeCompare(b.parrainLabel, "fr");
    if (parrainCmp !== 0) return parrainCmp;
    if (a.generation !== b.generation) return a.generation - b.generation;
    return compareOrganisationContactsByPrenom(a.contact, b.contact);
  });

  return entries;
}

function resolveParrainLabel(
  parrainId: number | null,
  selfId: number,
  byId: Map<number, Contact>
): string {
  if (parrainId == null) return "Non renseigné";
  if (parrainId === selfId) return "Moi";
  const parrain = byId.get(parrainId);
  if (parrain) return contactDisplayLabel(parrain);
  return `Contact introuvable (#${parrainId})`;
}

export type OrganisationDesinscritGroup = {
  parrainId: number | null;
  parrainLabel: string;
  entries: OrganisationDesinscritEntry[];
};

/** Regroupe les désinscrits par parrain pour affichage. */
export function groupDesinscritsByParrain(
  entries: OrganisationDesinscritEntry[]
): OrganisationDesinscritGroup[] {
  const map = new Map<string, OrganisationDesinscritGroup>();

  for (const entry of entries) {
    const key = entry.parrainId != null ? String(entry.parrainId) : "__none__";
    let group = map.get(key);
    if (!group) {
      group = {
        parrainId: entry.parrainId,
        parrainLabel: entry.parrainLabel,
        entries: [],
      };
      map.set(key, group);
    }
    group.entries.push(entry);
  }

  const groups = [...map.values()];
  groups.sort((a, b) => {
    if (a.parrainLabel === "Moi") return -1;
    if (b.parrainLabel === "Moi") return 1;
    return a.parrainLabel.localeCompare(b.parrainLabel, "fr");
  });

  for (const group of groups) {
    group.entries.sort((a, b) => {
      if (a.generation !== b.generation) return a.generation - b.generation;
      return compareOrganisationContactsByPrenom(a.contact, b.contact);
    });
  }

  return groups;
}

export function buildOrganisationTree(
  contacts: Contact[],
  cgp: Pick<CgpConfig, "nom" | "prenom">
): OrganisationTreeResult {
  const selfContact = resolveOrganisationSelfContact(contacts, cgp);
  const selfDisplayName = buildOrganisationSelfDisplayName(cgp, selfContact);
  const byId = indexContactsById(contacts);
  const byParrain = indexDownlineByParrain(contacts);

  if (!selfContact) {
    return {
      selfContact: null,
      selfDisplayName,
      upline: [],
      generations: [],
      desinscrits: [],
      stats: { actifs: 0, desinscrits: 0, total: 0 },
    };
  }

  const upline = buildOrganisationUpline(selfContact, byId);
  const generations = buildActifGenerationLayers(selfContact, byParrain, byId);
  const desinscrits = collectOrganisationDesinscrits(selfContact, byParrain, byId);
  const actifs = generations.reduce((sum, layer) => sum + layer.length, 0);

  return {
    selfContact,
    selfDisplayName,
    upline,
    generations,
    desinscrits,
    stats: {
      actifs,
      desinscrits: desinscrits.length,
      total: actifs + desinscrits.length,
    },
  };
}

/** Tous les IDs contact présents (upline + arbre actif + désinscrits + self). */
export function collectOrganisationContactIds(tree: OrganisationTreeResult): number[] {
  const ids: number[] = [];
  if (tree.selfContact?.id != null) ids.push(tree.selfContact.id);

  for (const node of tree.upline) {
    ids.push(node.contact.id);
  }

  for (const layer of tree.generations) {
    for (const node of layer) {
      ids.push(node.contact.id);
    }
  }

  for (const entry of tree.desinscrits) {
    ids.push(entry.contact.id);
    if (entry.parrainId != null) ids.push(entry.parrainId);
  }

  return [...new Set(ids)];
}
