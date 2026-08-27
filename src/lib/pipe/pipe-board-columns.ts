import type { PipeRecord } from "@/lib/api/tauri-pipe";
import type { PipeTimelineEntryRecord } from "@/lib/api/tauri-pipe-timeline";
import {
  isRdvTimelineEntryCompleted,
  latestRdvEntryForStage,
} from "@/lib/pipe/pipe-rdv-completion";
import type { PipeRdvStage } from "@/lib/pipe/pipe-rdv-stage";
import { isPipeStage, type PipeStage } from "@/lib/pipe/pipe-types";

/** Colonnes du kanban affaires (positionné = date prise, réalisé = RDV fini sans suivant). */
export const PIPE_BOARD_COLUMNS = [
  "PROSPECTION",
  "R1_POSITIONNE",
  "R1_REALISE",
  "R2_POSITIONNE",
  "R2_REALISE",
  "R3_POSITIONNE",
  "R3_REALISE",
  "GAGNEE",
  "PERDUE_OU_EN_ATTENTE",
] as const;

export type PipeBoardColumn = (typeof PIPE_BOARD_COLUMNS)[number];

export const PIPE_BOARD_COLUMN_LABELS: Record<PipeBoardColumn, string> = {
  PROSPECTION: "Prospection",
  R1_POSITIONNE: "R1 positionné",
  R1_REALISE: "R1 réalisé",
  R2_POSITIONNE: "R2 positionné",
  R2_REALISE: "R2 réalisé",
  R3_POSITIONNE: "R3 positionné",
  R3_REALISE: "R3 réalisé",
  GAGNEE: "Gagnée",
  PERDUE_OU_EN_ATTENTE: "Perdue ou en attente",
};

/** Libellés compacts pour 9 colonnes. */
export const PIPE_BOARD_COLUMN_SHORT_LABELS: Record<PipeBoardColumn, string> = {
  PROSPECTION: "Prosp.",
  R1_POSITIONNE: "R1 pos.",
  R1_REALISE: "R1 fait",
  R2_POSITIONNE: "R2 pos.",
  R2_REALISE: "R2 fait",
  R3_POSITIONNE: "R3 pos.",
  R3_REALISE: "R3 fait",
  GAGNEE: "Gagnée",
  PERDUE_OU_EN_ATTENTE: "Perdue",
};

/** Ligne du funnel (sans Gagnée / Perdue). */
export const PIPE_BOARD_FUNNEL_COLUMNS = [
  "PROSPECTION",
  "R1_POSITIONNE",
  "R1_REALISE",
  "R2_POSITIONNE",
  "R2_REALISE",
  "R3_POSITIONNE",
  "R3_REALISE",
] as const satisfies readonly PipeBoardColumn[];

/** Ligne du bas : issues, plus larges. */
export const PIPE_BOARD_OUTCOME_COLUMNS = [
  "GAGNEE",
  "PERDUE_OU_EN_ATTENTE",
] as const satisfies readonly PipeBoardColumn[];

const RDV_RANKS: readonly PipeRdvStage[] = ["R1", "R2", "R3"];

export function isPipeBoardColumn(value: string): value is PipeBoardColumn {
  return (PIPE_BOARD_COLUMNS as readonly string[]).includes(value);
}

export function isPipeBoardRdvDropTargetColumn(column: PipeBoardColumn): boolean {
  return column === "R1_POSITIONNE" || column === "R2_POSITIONNE" || column === "R3_POSITIONNE";
}

export function isPipeBoardManualDropTargetColumn(
  column: PipeBoardColumn
): column is "GAGNEE" | "PERDUE_OU_EN_ATTENTE" {
  return column === "GAGNEE" || column === "PERDUE_OU_EN_ATTENTE";
}

export function isPipeBoardDropTargetColumn(column: PipeBoardColumn): boolean {
  return isPipeBoardRdvDropTargetColumn(column) || isPipeBoardManualDropTargetColumn(column);
}

export function rdvStageFromBoardColumn(column: PipeBoardColumn): PipeRdvStage | null {
  if (column === "R1_POSITIONNE" || column === "R1_REALISE") return "R1";
  if (column === "R2_POSITIONNE" || column === "R2_REALISE") return "R2";
  if (column === "R3_POSITIONNE" || column === "R3_REALISE") return "R3";
  return null;
}

/** Stage SQLite aligné sur la colonne kanban affichée. */
export function storedStageFromBoardColumn(column: PipeBoardColumn): PipeStage {
  if (column === "R1_POSITIONNE" || column === "R1_REALISE") return "R1";
  if (column === "R2_POSITIONNE" || column === "R2_REALISE") return "R2";
  if (column === "R3_POSITIONNE" || column === "R3_REALISE") return "R3";
  return column;
}

export function boardColumnMatchesPipeStageFilter(
  column: PipeBoardColumn,
  stage: PipeStage
): boolean {
  if (stage === "R1") return column === "R1_POSITIONNE" || column === "R1_REALISE";
  if (stage === "R2") return column === "R2_POSITIONNE" || column === "R2_REALISE";
  if (stage === "R3") return column === "R3_POSITIONNE" || column === "R3_REALISE";
  return column === stage;
}

/** Rang commercial 0–3 à partir du stage persisté (création mid-funnel sans RDV). */
export function commercialRankFloor(stage: string): 0 | 1 | 2 | 3 {
  if (stage === "R1") return 1;
  if (stage === "R2") return 2;
  if (stage === "R3" || stage === "GAGNEE") return 3;
  return 0;
}

/**
 * Plancher de création : AVANCEMENT né avec le pipe (même timestamp que CREATION),
 * sinon le stage persisté. Ne suit pas les avancements RDV ultérieurs.
 */
export function originRankFloor(
  stage: string,
  entries: PipeTimelineEntryRecord[]
): 0 | 1 | 2 | 3 {
  const creation = entries.find((entry) => entry.entry_type === "CREATION");
  if (creation) {
    const birth = entries.find((entry) => {
      if (entry.entry_type !== "AVANCEMENT") return false;
      if (Math.abs(entry.occurred_at - creation.occurred_at) > 2) return false;
      return commercialRankFloor(entry.titre ?? "") > 0;
    });
    if (birth) return commercialRankFloor(birth.titre ?? "");
  }
  return commercialRankFloor(stage);
}

function rankHasCancellationTrace(
  entries: PipeTimelineEntryRecord[],
  rank: PipeRdvStage
): boolean {
  const rankPattern =
    rank === "R1" ? /\bR1\b/ : rank === "R2" ? /\bR2\b/ : /\bR3\b/;
  return entries.some((entry) => {
    if (entry.entry_type !== "NOTE") return false;
    const text = entry.contenu?.trim() ?? "";
    return rankPattern.test(text) && /annulé/.test(text);
  });
}

type RankStatus = "none" | "positionne" | "realise";

function rankStatus(
  rdvStage: PipeRdvStage,
  entries: PipeTimelineEntryRecord[],
  now: Date
): RankStatus {
  const latest = latestRdvEntryForStage(entries, rdvStage);
  if (!latest) return "none";
  return isRdvTimelineEntryCompleted(latest, now) ? "realise" : "positionne";
}

function isRankPositionne(status: RankStatus): boolean {
  return status === "positionne";
}

function isRankRealise(
  status: RankStatus,
  rank: PipeRdvStage,
  rankNumber: number,
  floor: number,
  entries: PipeTimelineEntryRecord[],
  statuses: RankStatus[]
): boolean {
  if (status === "realise") return true;
  if (status === "positionne") return false;
  if (rankHasCancellationTrace(entries, rank)) return false;
  const hasAnyLiveRdv = statuses.some((item) => item !== "none");
  if (hasAnyLiveRdv) {
    return statuses.slice(rankNumber).some((item) => item !== "none");
  }
  return floor > rankNumber;
}

/**
 * Colonne kanban : premier RDV du cycle pas encore fait.
 * Positionné = date prise et créneau pas fini. Réalisé = fini, suivant non posé.
 */
export function resolveAffaireBoardColumn(
  pipe: Pick<PipeRecord, "stage" | "pipe_type">,
  entries: PipeTimelineEntryRecord[],
  now: Date = new Date()
): PipeBoardColumn {
  if (pipe.stage === "GAGNEE") return "GAGNEE";
  if (pipe.stage === "PERDUE_OU_EN_ATTENTE") return "PERDUE_OU_EN_ATTENTE";

  const floor = originRankFloor(pipe.stage, entries);
  const statuses = RDV_RANKS.map((stage) => rankStatus(stage, entries, now));

  for (let index = 0; index < RDV_RANKS.length; index += 1) {
    const rank = RDV_RANKS[index]!;
    const status = statuses[index]!;
    if (isRankPositionne(status)) {
      return `${rank}_POSITIONNE` as PipeBoardColumn;
    }
    if (!isRankRealise(status, rank, index + 1, floor, entries, statuses)) {
      continue;
    }

    const nextIndex = index + 1;
    if (nextIndex >= RDV_RANKS.length) return "R3_REALISE";
    const nextStatus = statuses[nextIndex]!;
    const nextRank = RDV_RANKS[nextIndex]!;
    const nextRealise = isRankRealise(
      nextStatus,
      nextRank,
      nextIndex + 1,
      floor,
      entries,
      statuses
    );
    if (!isRankPositionne(nextStatus) && !nextRealise) {
      return `${rank}_REALISE` as PipeBoardColumn;
    }
  }

  return "PROSPECTION";
}

export function groupRdvEntriesByPipeId(
  entries: PipeTimelineEntryRecord[]
): Record<number, PipeTimelineEntryRecord[]> {
  const map: Record<number, PipeTimelineEntryRecord[]> = {};
  for (const entry of entries) {
    (map[entry.pipe_id] ??= []).push(entry);
  }
  return map;
}

export function groupAffairesByBoardColumn(
  affaires: PipeRecord[],
  entriesByPipeId: Record<number, PipeTimelineEntryRecord[]>,
  now: Date = new Date()
): Record<PipeBoardColumn, PipeRecord[]> {
  const groups = Object.fromEntries(
    PIPE_BOARD_COLUMNS.map((column) => [column, [] as PipeRecord[]])
  ) as Record<PipeBoardColumn, PipeRecord[]>;

  for (const pipe of affaires) {
    const column = resolveAffaireBoardColumn(pipe, entriesByPipeId[pipe.id] ?? [], now);
    groups[column].push(pipe);
  }

  for (const column of PIPE_BOARD_COLUMNS) {
    groups[column].sort((a, b) => b.updated_at - a.updated_at);
  }

  return groups;
}

export function formatPipeBoardColumnLabel(
  pipe: Pick<PipeRecord, "stage" | "pipe_type">,
  entries: PipeTimelineEntryRecord[] | undefined,
  now: Date = new Date()
): string | null {
  if (pipe.pipe_type !== "AFFAIRE") return null;
  if (!isPipeStage(pipe.stage) && !isPipeBoardColumn(pipe.stage)) return null;
  if (entries === undefined) return null;
  return PIPE_BOARD_COLUMN_LABELS[resolveAffaireBoardColumn(pipe, entries, now)];
}
