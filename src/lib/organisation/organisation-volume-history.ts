import type { Contact } from "@/lib/api/tauri-contacts";
import type { FilleulVolumeExercice } from "@/lib/api/tauri-filleul-volumes";
import {
  currentFiscalYearLabel,
  hasFiscalYearStarted,
  listSelectableFiscalYearLabels,
} from "@/lib/pipe/remuneration-fiscal-year";
import type { OrganisationTreeResult } from "@/lib/organisation/organisation-tree";
import {
  buildOrganisationVolumeRows,
  buildOrganisationVolumeRowsWithOwnVolumes,
  contactManagerVolume,
  type OrganisationVolumeRow,
} from "@/lib/organisation/organisation-branch-volumes";

export const ORGANISATION_CURRENT_EXERCICE = "__current__" as const;

export type OrganisationExerciceSelection =
  | typeof ORGANISATION_CURRENT_EXERCICE
  | string;

export function isCurrentOrganisationExercice(
  selection: OrganisationExerciceSelection
): boolean {
  return selection === ORGANISATION_CURRENT_EXERCICE;
}

export function resolveOrganisationExerciceLabel(
  selection: OrganisationExerciceSelection,
  now = new Date()
): string {
  if (isCurrentOrganisationExercice(selection)) {
    return currentFiscalYearLabel(now);
  }
  return selection;
}

/** Volumes « live » sur fiche contact : exercice fiscal en cours et non clôturé. */
export function isLiveFilleulExerciceVolumes(
  exerciceLabel: string,
  closedExerciceLabels: string[],
  now = new Date()
): boolean {
  if (closedExerciceLabels.includes(exerciceLabel)) return false;
  return exerciceLabel === currentFiscalYearLabel(now);
}

/** Historique importé / clôturé disponible pour cet exercice. */
export function hasFilleulExerciceVolumeSnapshot(
  exerciceLabel: string,
  historyRecordsByLabel: Map<string, FilleulVolumeExercice[]>
): boolean {
  const records = historyRecordsByLabel.get(exerciceLabel);
  return records != null && records.length > 0;
}

/** Mode historique : exercice non live avec snapshot en base. */
export function shouldUseHistoricalFilleulExerciceVolumes(
  exerciceLabel: string,
  closedExerciceLabels: string[],
  historyRecordsByLabel: Map<string, FilleulVolumeExercice[]>,
  now = new Date()
): boolean {
  if (isLiveFilleulExerciceVolumes(exerciceLabel, closedExerciceLabels, now)) return false;
  return hasFilleulExerciceVolumeSnapshot(exerciceLabel, historyRecordsByLabel);
}

/** Volumes affichables : exercice en cours ou snapshot importé / clôturé. */
export function isFilleulExerciceVolumeResolvable(
  exerciceLabel: string,
  closedExerciceLabels: string[],
  historyRecordsByLabel: Map<string, FilleulVolumeExercice[]>,
  now = new Date()
): boolean {
  return (
    isLiveFilleulExerciceVolumes(exerciceLabel, closedExerciceLabels, now) ||
    hasFilleulExerciceVolumeSnapshot(exerciceLabel, historyRecordsByLabel)
  );
}

/** Labels avec historique importé / clôturé (affichage sélecteur). */
export function buildOrganisationExerciceOptions(
  historyExerciceLabels: string[],
  closedExerciceLabels: string[],
  now = new Date()
): { value: OrganisationExerciceSelection; label: string }[] {
  const current = currentFiscalYearLabel(now);
  const closed = new Set(closedExerciceLabels);
  const historySet = new Set(historyExerciceLabels);
  const options: { value: OrganisationExerciceSelection; label: string }[] = [
    {
      value: ORGANISATION_CURRENT_EXERCICE,
      label: `${current} (en cours)`,
    },
  ];

  for (const label of historyExerciceLabels) {
    if (label === current) continue;
    options.push({
      value: label,
      label: closed.has(label) ? label : `${label} (non clôturé)`,
    });
  }

  if (closed.has(current)) {
    options[0] = { value: ORGANISATION_CURRENT_EXERCICE, label: current };
  }

  for (const label of listSelectableFiscalYearLabels(now)) {
    if (
      label === current ||
      closed.has(label) ||
      historySet.has(label) ||
      !hasFiscalYearStarted(label, now)
    ) {
      continue;
    }
    options.push({ value: label, label: `${label} (non clôturé)` });
  }

  return options;
}

export function indexFilleulVolumeExercicesByContactId(
  records: FilleulVolumeExercice[]
): Map<number, FilleulVolumeExercice> {
  const map = new Map<number, FilleulVolumeExercice>();
  for (const record of records) {
    map.set(record.contactId, record);
  }
  return map;
}

function readStoredVolume(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value) || value < 0) return 0;
  return value;
}

export function applyExerciceVolumesToContacts(
  contacts: Contact[],
  recordsByContactId: Map<number, FilleulVolumeExercice>
): Contact[] {
  if (recordsByContactId.size === 0) return contacts;
  return contacts.map((contact) => {
    if (contact.id == null) return contact;
    const record = recordsByContactId.get(contact.id);
    if (!record) {
      return { ...contact, filleul_volume: null };
    }
    return {
      ...contact,
      filleul_volume:
        record.volumePropre != null ? readStoredVolume(record.volumePropre) : null,
      filleul_volume_manager:
        record.volumeManager != null
          ? readStoredVolume(record.volumeManager)
          : contact.filleul_volume_manager,
    };
  });
}

export function buildOrganisationVolumeRowsForExercice(
  tree: OrganisationTreeResult,
  allContacts: Contact[],
  options:
    | { mode: "current" }
    | { mode: "history"; recordsByContactId: Map<number, FilleulVolumeExercice> }
): OrganisationVolumeRow[] {
  if (options.mode === "current") {
    return buildOrganisationVolumeRows(tree, allContacts);
  }

  const ownById = new Map<number, number>();
  const branchById = new Map<number, number>();
  for (const contact of allContacts) {
    if (contact.id == null) continue;
    const record = options.recordsByContactId.get(contact.id);
    ownById.set(
      contact.id,
      record?.volumePropre != null ? readStoredVolume(record.volumePropre) : 0
    );
    if (record?.volumeBranche != null) {
      branchById.set(contact.id, readStoredVolume(record.volumeBranche));
    }
  }

  return buildOrganisationVolumeRowsWithOwnVolumes(tree, allContacts, ownById, {
    branchById,
    resolveManagerVolume: (contact) => {
      if (contact.id == null) return 0;
      const record = options.recordsByContactId.get(contact.id);
      return record?.volumeManager != null
        ? readStoredVolume(record.volumeManager)
        : contactManagerVolume(contact);
    },
    selfNetworkVolumeExclSelf: computeHistoricalSelfNetworkVolume(
      tree,
      options.recordsByContactId
    ),
  });
}

function computeHistoricalSelfNetworkVolume(
  tree: OrganisationTreeResult,
  recordsByContactId: Map<number, FilleulVolumeExercice>
): number {
  let total = 0;
  for (const layer of tree.generations) {
    for (const node of layer) {
      if (node.generation > 8 || node.contact.id == null) continue;
      const record = recordsByContactId.get(node.contact.id);
      total += record?.volumePropre != null
        ? readStoredVolume(record.volumePropre)
        : 0;
    }
  }
  return total;
}

export type CloseFilleulExerciceSnapshot = {
  contactId: number;
  volumePropre: number;
  volumeBranche: number;
  volumeManager: number;
};

export function buildCloseFilleulExerciceSnapshots(
  tree: OrganisationTreeResult,
  allContacts: Contact[]
): CloseFilleulExerciceSnapshot[] {
  return buildOrganisationVolumeRows(tree, allContacts).map((row) => ({
    contactId: row.contactId,
    volumePropre: row.ownVolume,
    volumeBranche: row.branchVolume,
    volumeManager: row.managerVolume,
  }));
}

/** Clôture d'un exercice déjà importé : reprend les volumes stockés, pas le live. */
export function buildCloseFilleulExerciceSnapshotsFromHistory(
  records: FilleulVolumeExercice[]
): CloseFilleulExerciceSnapshot[] {
  return records.map((record) => ({
    contactId: record.contactId,
    volumePropre: record.volumePropre ?? 0,
    volumeBranche: record.volumeBranche ?? 0,
    volumeManager: record.volumeManager ?? 0,
  }));
}
