import type { Contact } from "@/lib/api/tauri-contacts";
import type { FilleulDossier } from "@/lib/api/tauri-filleul-dossier";
import {
  resolveFilleulInvitationTimestamp,
  resolveFilleulInscriptionTimestamp,
} from "@/lib/organisation/organisation-filleul-dossier";
import {
  isAffiliationInExercice,
  isContactEligibleForMyFilleulJdFunnel,
  isMyFilleulInscritFromJdFunnel,
  formatFilleulManagerPercent,
} from "@/lib/statistiques/contact-filleul-organisation-stats";

export type FilleulPersoJdExerciceStatsOptions = {
  dossiersByContactId?: Map<number, FilleulDossier>;
  organisationSelfContactId?: number | null;
};

export type FilleulPersoJdExerciceStatResult = {
  jdInvitationCount: number;
  jdPresenceCount: number;
  inscribedCount: number;
  jdInvitationContactIds: number[];
  jdPresenceContactIds: number[];
  inscribedContactIds: number[];
};

export type FilleulPersoJdExerciceSummaryRow = {
  exerciceLabel: string;
  jdInvitationCount: number;
  jdPresenceCount: number;
  inscribedCount: number;
  conversionRate: number | null;
};

export type FilleulPersoJdExerciceSummaryMetricId =
  | "jdInvitationCount"
  | "jdPresenceCount"
  | "inscribedCount"
  | "conversionRate";

export type FilleulPersoJdExerciceSummaryMetric = {
  id: FilleulPersoJdExerciceSummaryMetricId;
  label: string;
  format: (row: FilleulPersoJdExerciceSummaryRow) => string;
  formatTotal?: (rows: FilleulPersoJdExerciceSummaryRow[]) => string;
};

function sumPersoJdRowCounts(
  rows: FilleulPersoJdExerciceSummaryRow[],
  key: "jdInvitationCount" | "jdPresenceCount" | "inscribedCount"
): number {
  return rows.reduce((acc, row) => acc + row[key], 0);
}

function formatCount(count: number): string {
  return String(count);
}

export function formatFilleulPersoJdConversionRate(
  inscribedCount: number,
  invitationCount: number
): string {
  if (invitationCount <= 0) return "—";
  const rate = (inscribedCount / invitationCount) * 100;
  return formatFilleulManagerPercent(rate);
}

export function computeFilleulPersoJdConversionRate(
  inscribedCount: number,
  invitationCount: number
): number | null {
  if (invitationCount <= 0) return null;
  return (inscribedCount / invitationCount) * 100;
}

export const FILLEUL_PERSO_JD_EXERCICE_SUMMARY_METRICS: FilleulPersoJdExerciceSummaryMetric[] =
  [
    {
      id: "jdInvitationCount",
      label: "Invitations JD",
      format: (row) => formatCount(row.jdInvitationCount),
      formatTotal: (rows) => formatCount(sumPersoJdRowCounts(rows, "jdInvitationCount")),
    },
    {
      id: "jdPresenceCount",
      label: "Présents JD",
      format: (row) => formatCount(row.jdPresenceCount),
      formatTotal: (rows) => formatCount(sumPersoJdRowCounts(rows, "jdPresenceCount")),
    },
    {
      id: "inscribedCount",
      label: "Inscrits",
      format: (row) => formatCount(row.inscribedCount),
      formatTotal: (rows) => formatCount(sumPersoJdRowCounts(rows, "inscribedCount")),
    },
    {
      id: "conversionRate",
      label: "Taux de conversion",
      format: (row) =>
        formatFilleulPersoJdConversionRate(row.inscribedCount, row.jdInvitationCount),
      formatTotal: (rows) =>
        formatFilleulPersoJdConversionRate(
          sumPersoJdRowCounts(rows, "inscribedCount"),
          sumPersoJdRowCounts(rows, "jdInvitationCount")
        ),
    },
  ];

function isJdInvitationContact(
  contact: Contact,
  exerciceLabel: string,
  selfContactId: number | null | undefined,
  dossiersByContactId?: Map<number, FilleulDossier>
): boolean {
  if (contact.id == null) return false;
  if (!isContactEligibleForMyFilleulJdFunnel(contact, selfContactId)) return false;
  if (contact.type_invitation_filleul !== "JD") return false;
  const dossier = dossiersByContactId?.get(contact.id);
  const invitation = resolveFilleulInvitationTimestamp(contact, dossier);
  return isAffiliationInExercice(invitation, exerciceLabel);
}

/** Inscrit JD sur l'exercice : inscription dans l'exercice (dossier prioritaire). */
function isMyJdInscritInExercice(
  contact: Contact,
  exerciceLabel: string,
  selfContactId: number | null | undefined,
  dossiersByContactId?: Map<number, FilleulDossier>
): boolean {
  if (contact.id == null) return false;
  if (!isMyFilleulInscritFromJdFunnel(contact, selfContactId)) return false;
  if (!isContactEligibleForMyFilleulJdFunnel(contact, selfContactId)) return false;
  if (contact.type_invitation_filleul !== "JD") return false;

  const dossier = dossiersByContactId?.get(contact.id);
  const inscription = resolveFilleulInscriptionTimestamp(contact, dossier);
  if (inscription != null) {
    return isAffiliationInExercice(inscription, exerciceLabel);
  }

  // Legacy : inscription absente mais invitation JD sur l'exercice (funnel aligné dashboard).
  return isJdInvitationContact(contact, exerciceLabel, selfContactId, dossiersByContactId);
}

export function computeFilleulPersoJdExerciceStats(
  contacts: Contact[],
  exerciceLabel: string,
  options?: FilleulPersoJdExerciceStatsOptions
): FilleulPersoJdExerciceStatResult {
  const selfContactId = options?.organisationSelfContactId;
  const dossiersByContactId = options?.dossiersByContactId;
  const jdInvitationContactIds: number[] = [];
  const jdPresenceContactIds: number[] = [];
  const inscribedContactIds: number[] = [];

  for (const contact of contacts) {
    if (contact.id == null) continue;

    if (isJdInvitationContact(contact, exerciceLabel, selfContactId, dossiersByContactId)) {
      jdInvitationContactIds.push(contact.id);
      if (contact.presence_invitation_filleul === 1) {
        jdPresenceContactIds.push(contact.id);
      }
    }

    if (isMyJdInscritInExercice(contact, exerciceLabel, selfContactId, dossiersByContactId)) {
      inscribedContactIds.push(contact.id);
    }
  }

  return {
    jdInvitationCount: jdInvitationContactIds.length,
    jdPresenceCount: jdPresenceContactIds.length,
    inscribedCount: inscribedContactIds.length,
    jdInvitationContactIds,
    jdPresenceContactIds,
    inscribedContactIds,
  };
}

export function computeFilleulPersoJdExerciceSummary(
  exerciceLabels: string[],
  contacts: Contact[],
  options?: FilleulPersoJdExerciceStatsOptions
): FilleulPersoJdExerciceSummaryRow[] {
  return exerciceLabels.map((exerciceLabel) => {
    const stats = computeFilleulPersoJdExerciceStats(contacts, exerciceLabel, options);
    return {
      exerciceLabel,
      jdInvitationCount: stats.jdInvitationCount,
      jdPresenceCount: stats.jdPresenceCount,
      inscribedCount: stats.inscribedCount,
      conversionRate: computeFilleulPersoJdConversionRate(
        stats.inscribedCount,
        stats.jdInvitationCount
      ),
    };
  });
}

export function filterContactsForFilleulPersoJdExerciceList(
  contacts: Contact[],
  exerciceLabel: string,
  kind: FilleulPersoJdExerciceSummaryMetricId,
  options?: FilleulPersoJdExerciceStatsOptions
): Contact[] {
  const stats = computeFilleulPersoJdExerciceStats(contacts, exerciceLabel, options);
  const idSet = new Set(
    kind === "jdInvitationCount"
      ? stats.jdInvitationContactIds
      : kind === "jdPresenceCount"
        ? stats.jdPresenceContactIds
        : stats.inscribedContactIds
  );
  return contacts.filter((contact) => contact.id != null && idSet.has(contact.id));
}
