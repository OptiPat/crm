import type { Contact } from "@/lib/api/tauri-contacts";
import type { FilleulVolumeExercice } from "@/lib/api/tauri-filleul-volumes";
import { isFilleulReseauInscrit } from "@/lib/contacts/contact-form-utils";
import { currentFiscalYearLabel } from "@/lib/pipe/remuneration-fiscal-year";
import { computeContactBranchVolumeSummary } from "@/lib/organisation/organisation-branch-volumes";

export type MemberDossierVolumeRow = {
  exerciceLabel: string;
  volumePropre: number;
  volumeBranche: number | null;
  volumeManager: number | null;
  isCurrent: boolean;
  source: string;
};

function readVolume(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value) || value < 0) return 0;
  return value;
}

/** Historique volumes d'un consultant : exercices importés/clôturés + exercice courant live. */
export function buildMemberDossierVolumeRows(
  contact: Contact,
  historyRecords: FilleulVolumeExercice[],
  allContacts: Contact[],
  selfContact: Contact | null,
  now = new Date()
): MemberDossierVolumeRow[] {
  if (!isFilleulReseauInscrit(contact.filleul_categorie)) {
    return historyRecords.map((record) => ({
      exerciceLabel: record.exerciceLabel,
      volumePropre: readVolume(record.volumePropre),
      volumeBranche:
        record.volumeBranche != null ? readVolume(record.volumeBranche) : null,
      volumeManager:
        record.volumeManager != null ? readVolume(record.volumeManager) : null,
      isCurrent: false,
      source: record.source,
    }));
  }

  const currentLabel = currentFiscalYearLabel(now);
  const historyByLabel = new Map(
    historyRecords.map((record) => [record.exerciceLabel, record])
  );
  const labelSet = new Set(historyRecords.map((record) => record.exerciceLabel));
  labelSet.add(currentLabel);

  const liveSummary = computeContactBranchVolumeSummary(
    contact,
    allContacts,
    selfContact
  );

  const rows: MemberDossierVolumeRow[] = [];

  for (const label of [...labelSet].sort((a, b) => b.localeCompare(a))) {
    const record = historyByLabel.get(label);
    const isCurrent = label === currentLabel;

    if (record) {
      const snapshotClosed = record.closedAt != null;
      if (isCurrent && !snapshotClosed) {
        rows.push({
          exerciceLabel: label,
          volumePropre: liveSummary.ownVolume,
          volumeBranche: liveSummary.branchVolume,
          volumeManager: liveSummary.managerVolume,
          isCurrent: true,
          source: "live",
        });
        continue;
      }

      rows.push({
        exerciceLabel: label,
        volumePropre: readVolume(record.volumePropre),
        volumeBranche:
          record.volumeBranche != null
            ? readVolume(record.volumeBranche)
            : isCurrent
              ? liveSummary.branchVolume
              : null,
        volumeManager:
          record.volumeManager != null
            ? readVolume(record.volumeManager)
            : isCurrent
              ? liveSummary.managerVolume
              : null,
        isCurrent,
        source: record.source,
      });
      continue;
    }

    if (isCurrent) {
      rows.push({
        exerciceLabel: label,
        volumePropre: liveSummary.ownVolume,
        volumeBranche: liveSummary.branchVolume,
        volumeManager: liveSummary.managerVolume,
        isCurrent: true,
        source: "live",
      });
    }
  }

  return rows;
}
