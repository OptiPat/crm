import type { Contact } from "@/lib/api/tauri-contacts";
import { formatEuroAmountCif, parseEuroInput } from "@/lib/souscription-cif/build-annexes-scpi-costs";
import type { OrganisationTreeResult } from "@/lib/organisation/organisation-tree";
import {
  getManagerObjectiveStatus,
  isManagerObjectiveEligible,
} from "@/lib/organisation/organisation-manager-objective";
import {
  indexContactsById,
  isOrganisationActifFilleul,
} from "@/lib/organisation/organisation-tree";

/** @deprecated Utiliser ORGANISATION_MANAGER_VOLUME_TARGET — conservé pour imports existants. */
export const ORGANISATION_DIRECT_BRANCH_VOLUME_TARGET = 500_000;

/** Objectif réseau pour le CGP (volumes propres gen 1–8, hors volume perso). */
export const ORGANISATION_SELF_NETWORK_VOLUME_TARGET = 3_000_000;

/** Profondeur max incluse pour l'objectif réseau du CGP. */
export const ORGANISATION_SELF_NETWORK_MAX_GENERATION = 8;

export type DirectBranchVolumeStatus = "target_met" | "below_target" | "not_applicable";

export type SelfNetworkVolumeStatus = "target_met" | "below_target";

export type OrganisationVolumeRow = {
  contactId: number;
  generation: number;
  label: string;
  /** Volume propre de l'exercice en cours. */
  ownVolume: number;
  /** Volume branche exercice (propre + descendance, exercice en cours). */
  branchVolume: number;
  /** Volume branche cumulatif objectif Manager (hors exercice). */
  managerVolume: number;
  managerObjectiveEligible: boolean;
  /** CGP : somme volumes propres gen 1–8 (hors volume perso). */
  networkVolumeExclSelf?: number;
};

/** Code couleur : filleuls directs uniquement (leur volume + descendance). */
export function getDirectBranchVolumeStatus(
  branchVolume: number,
  generation: number
): DirectBranchVolumeStatus {
  if (generation !== 1) return "not_applicable";
  if (branchVolume >= ORGANISATION_DIRECT_BRANCH_VOLUME_TARGET) return "target_met";
  return "below_target";
}

/** Somme des volumes propres gen 1–8 (volume perso CGP exclu). */
export function computeSelfNetworkVolumeWithinDepth(tree: OrganisationTreeResult): number {
  let total = 0;
  for (const layer of tree.generations) {
    for (const node of layer) {
      if (node.generation <= ORGANISATION_SELF_NETWORK_MAX_GENERATION) {
        total += contactOwnVolume(node.contact);
      }
    }
  }
  return total;
}

export function getSelfNetworkVolumeStatus(
  networkVolume: number
): SelfNetworkVolumeStatus {
  if (networkVolume >= ORGANISATION_SELF_NETWORK_VOLUME_TARGET) return "target_met";
  return "below_target";
}

export function getVolumeBranchDisplayAmount(row: OrganisationVolumeRow): number {
  return row.branchVolume;
}

/**
 * Code couleur colonne Vol. branche (exercice) :
 * - Filleul direct (gen. 1) : 500 k€ volume branche exercice
 * La prime de dev CGP (3 M€) est sur le badge en haut, pas sur cette colonne pour « vous ».
 */
export function getVolumeBranchColorStatus(
  row: OrganisationVolumeRow
): DirectBranchVolumeStatus | "not_applicable" {
  if (row.generation === 1) {
    return getDirectBranchVolumeStatus(row.branchVolume, row.generation);
  }
  return "not_applicable";
}

export function getManagerObjectiveColorStatus(
  row: OrganisationVolumeRow
): ReturnType<typeof getManagerObjectiveStatus> {
  if (row.generation === 0) return "not_applicable";
  return getManagerObjectiveStatus(row.managerVolume, row.managerObjectiveEligible);
}

export function contactOwnVolume(contact: Contact): number {
  const v = contact.filleul_volume;
  if (v == null || !Number.isFinite(v) || v < 0) return 0;
  return v;
}

export function contactManagerVolume(contact: Contact): number {
  const v = contact.filleul_volume_manager;
  if (v == null || !Number.isFinite(v) || v < 0) return 0;
  return v;
}

export function formatFilleulVolumeField(euros: number): string {
  if (euros === 0) return "";
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(euros);
}

export function parseFilleulVolumeField(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return 0;
  const euros = parseEuroInput(trimmed.replace(/\s/g, ""));
  if (euros == null || euros < 0) return null;
  return euros;
}

export function formatFilleulVolumeDisplay(euros: number): string {
  return formatEuroAmountCif(euros);
}

function indexActiveFilleulsByParrain(contacts: Contact[]): Map<number, Contact[]> {
  const map = new Map<number, Contact[]>();
  for (const c of contacts) {
    if (c.id == null || c.parrain_id == null) continue;
    if (!isOrganisationActifFilleul(c)) continue;
    const list = map.get(c.parrain_id) ?? [];
    list.push(c);
    map.set(c.parrain_id, list);
  }
  return map;
}

/** Volume branche = volume propre + descendance active (récursif). */
export function computeBranchVolume(
  contactId: number,
  ownById: Map<number, number>,
  byParrain: Map<number, Contact[]>,
  cache = new Map<number, number>()
): number {
  const cached = cache.get(contactId);
  if (cached != null) return cached;

  let total = ownById.get(contactId) ?? 0;
  for (const child of byParrain.get(contactId) ?? []) {
    if (child.id == null) continue;
    total += computeBranchVolume(child.id, ownById, byParrain, cache);
  }
  cache.set(contactId, total);
  return total;
}

/** Profondeur depuis le contact CGP (0 = vous, 1 = filleul direct, …). */
export function computeFilleulGenerationFromSelf(
  contactId: number,
  selfContactId: number,
  contacts: Contact[]
): number | null {
  if (contactId === selfContactId) return 0;
  const byId = indexContactsById(contacts);
  let depth = 0;
  let currentId: number | null = contactId;
  const visited = new Set<number>();
  while (currentId != null && currentId !== selfContactId) {
    if (visited.has(currentId)) return null;
    visited.add(currentId);
    const node = byId.get(currentId);
    if (!node?.parrain_id) return null;
    depth += 1;
    currentId = node.parrain_id;
  }
  if (currentId !== selfContactId) return null;
  return depth;
}

export type ContactBranchVolumeSummary = {
  ownVolume: number;
  branchVolume: number;
  managerVolume: number;
  generation: number | null;
  managerObjectiveEligible: boolean;
  managerObjectiveStatus: ReturnType<typeof getManagerObjectiveStatus>;
};

export function computeContactBranchVolumeSummary(
  contact: {
    id?: number | null;
    filleul_volume?: number | null;
    filleul_volume_manager?: number | null;
    filleul_titre?: string | null;
    filleul_qualification?: string | null;
  },
  allContacts: Contact[],
  selfContact: Contact | null
): ContactBranchVolumeSummary {
  const ownVolume = contactOwnVolume(contact as Contact);
  const managerVolume = contactManagerVolume(contact as Contact);
  const managerObjectiveEligible = isManagerObjectiveEligible(
    contact.filleul_titre,
    contact.filleul_qualification
  );
  if (contact.id == null) {
    return {
      ownVolume,
      branchVolume: ownVolume,
      managerVolume,
      generation: null,
      managerObjectiveEligible,
      managerObjectiveStatus: getManagerObjectiveStatus(managerVolume, managerObjectiveEligible),
    };
  }

  const mergedContacts = allContacts.map((c) =>
    c.id === contact.id ? { ...c, filleul_volume: contact.filleul_volume ?? c.filleul_volume } : c
  );
  const byParrain = indexActiveFilleulsByParrain(mergedContacts);
  const ownById = new Map<number, number>();
  for (const c of mergedContacts) {
    if (c.id != null) ownById.set(c.id, contactOwnVolume(c));
  }
  const branchVolume = computeBranchVolume(contact.id, ownById, byParrain);
  const generation =
    selfContact?.id != null
      ? computeFilleulGenerationFromSelf(contact.id, selfContact.id, mergedContacts)
      : null;

  return {
    ownVolume,
    branchVolume,
    managerVolume,
    generation,
    managerObjectiveEligible,
    managerObjectiveStatus: getManagerObjectiveStatus(managerVolume, managerObjectiveEligible),
  };
}

export function buildOrganisationVolumeRows(
  tree: OrganisationTreeResult,
  allContacts: Contact[]
): OrganisationVolumeRow[] {
  const byParrain = indexActiveFilleulsByParrain(allContacts);
  const ownById = new Map<number, number>();
  for (const c of allContacts) {
    if (c.id != null) ownById.set(c.id, contactOwnVolume(c));
  }
  const cache = new Map<number, number>();
  const rows: OrganisationVolumeRow[] = [];
  const selfNetworkVolumeExclSelf = computeSelfNetworkVolumeWithinDepth(tree);

  const push = (contact: Contact, generation: number, label: string) => {
    if (contact.id == null) return;
    rows.push({
      contactId: contact.id,
      generation,
      label,
      ownVolume: contactOwnVolume(contact),
      branchVolume: computeBranchVolume(contact.id, ownById, byParrain, cache),
      managerVolume: contactManagerVolume(contact),
      managerObjectiveEligible: isManagerObjectiveEligible(
        contact.filleul_titre,
        contact.filleul_qualification
      ),
      ...(generation === 0 ? { networkVolumeExclSelf: selfNetworkVolumeExclSelf } : {}),
    });
  };

  if (tree.selfContact) {
    push(tree.selfContact, 0, `${tree.selfDisplayName} (vous)`);
  }

  for (const layer of tree.generations) {
    for (const node of layer) {
      push(node.contact, node.generation, `${node.contact.prenom} ${node.contact.nom}`.trim());
    }
  }

  rows.sort(
    (a, b) => a.generation - b.generation || a.label.localeCompare(b.label, "fr")
  );
  return rows;
}
