import type { PipeBoardColumn } from "./pipe-board-columns";
import type { PipeStage } from "./pipe-types";

export interface PipeStageBoardColors {
  column: string;
  accent: string;
  header: string;
  title: string;
  badge: string;
  dot: string;
}

/** Couleurs funnel : prospection → R1–R3 → gagnée / perdue. */
export const PIPE_STAGE_BOARD_COLORS: Record<PipeStage, PipeStageBoardColors> = {
  PROSPECTION: {
    column:
      "border-slate-200/70 bg-slate-50/50 dark:border-slate-700/80 dark:bg-slate-950/30",
    accent: "border-t-slate-400 dark:border-t-slate-500",
    header: "border-slate-200/60 dark:border-slate-700/80",
    title: "text-slate-700 dark:text-slate-300",
    badge:
      "bg-slate-100 text-slate-700 border border-slate-200/80 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-600",
    dot: "bg-slate-400 dark:bg-slate-500 ring-slate-200 dark:ring-slate-800",
  },
  R1: {
    column: "border-sky-200/70 bg-sky-50/40 dark:border-sky-900 dark:bg-sky-950/25",
    accent: "border-t-sky-400 dark:border-t-sky-500",
    header: "border-sky-200/50 dark:border-sky-900",
    title: "text-sky-800 dark:text-sky-300",
    badge:
      "bg-sky-100 text-sky-800 border border-sky-200/80 dark:bg-sky-950 dark:text-sky-200 dark:border-sky-800",
    dot: "bg-sky-500 ring-sky-200 dark:ring-sky-900",
  },
  R2: {
    column: "border-blue-200/70 bg-blue-50/40 dark:border-blue-900 dark:bg-blue-950/25",
    accent: "border-t-blue-500 dark:border-t-blue-500",
    header: "border-blue-200/50 dark:border-blue-900",
    title: "text-blue-800 dark:text-blue-300",
    badge:
      "bg-blue-100 text-blue-800 border border-blue-200/80 dark:bg-blue-950 dark:text-blue-200 dark:border-blue-800",
    dot: "bg-blue-500 ring-blue-200 dark:ring-blue-900",
  },
  R3: {
    column:
      "border-violet-200/70 bg-violet-50/40 dark:border-violet-900 dark:bg-violet-950/25",
    accent: "border-t-violet-500 dark:border-t-violet-500",
    header: "border-violet-200/50 dark:border-violet-900",
    title: "text-violet-800 dark:text-violet-300",
    badge:
      "bg-violet-100 text-violet-800 border border-violet-200/80 dark:bg-violet-950 dark:text-violet-200 dark:border-violet-800",
    dot: "bg-violet-500 ring-violet-200 dark:ring-violet-900",
  },
  GAGNEE: {
    column:
      "border-emerald-200/70 bg-emerald-50/45 dark:border-emerald-900 dark:bg-emerald-950/25",
    accent: "border-t-emerald-500 dark:border-t-emerald-500",
    header: "border-emerald-200/50 dark:border-emerald-900",
    title: "text-emerald-800 dark:text-emerald-300",
    badge:
      "bg-emerald-100 text-emerald-800 border border-emerald-200/80 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-800",
    dot: "bg-emerald-500 ring-emerald-200 dark:ring-emerald-900",
  },
  PERDUE_OU_EN_ATTENTE: {
    column:
      "border-amber-200/70 bg-amber-50/40 dark:border-amber-900 dark:bg-amber-950/25",
    accent: "border-t-amber-500 dark:border-t-amber-500",
    header: "border-amber-200/50 dark:border-amber-900",
    title: "text-amber-900 dark:text-amber-300",
    badge:
      "bg-amber-100 text-amber-900 border border-amber-200/80 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800",
    dot: "bg-amber-500 ring-amber-200 dark:ring-amber-900",
  },
};

const R1_REALISE_COLORS: PipeStageBoardColors = {
  column: "border-sky-200/50 bg-sky-50/20 dark:border-sky-950 dark:bg-sky-950/15",
  accent: "border-t-sky-300 dark:border-t-sky-700",
  header: "border-sky-200/40 dark:border-sky-950",
  title: "text-sky-700 dark:text-sky-400",
  badge:
    "bg-sky-50 text-sky-700 border border-sky-200/70 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-900",
  dot: "bg-sky-400 ring-sky-100 dark:ring-sky-950",
};

const R2_REALISE_COLORS: PipeStageBoardColors = {
  column: "border-blue-200/50 bg-blue-50/20 dark:border-blue-950 dark:bg-blue-950/15",
  accent: "border-t-blue-300 dark:border-t-blue-700",
  header: "border-blue-200/40 dark:border-blue-950",
  title: "text-blue-700 dark:text-blue-400",
  badge:
    "bg-blue-50 text-blue-700 border border-blue-200/70 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-900",
  dot: "bg-blue-400 ring-blue-100 dark:ring-blue-950",
};

const R3_REALISE_COLORS: PipeStageBoardColors = {
  column:
    "border-violet-200/50 bg-violet-50/20 dark:border-violet-950 dark:bg-violet-950/15",
  accent: "border-t-violet-300 dark:border-t-violet-700",
  header: "border-violet-200/40 dark:border-violet-950",
  title: "text-violet-700 dark:text-violet-400",
  badge:
    "bg-violet-50 text-violet-700 border border-violet-200/70 dark:bg-violet-950 dark:text-violet-300 dark:border-violet-900",
  dot: "bg-violet-400 ring-violet-100 dark:ring-violet-950",
};

export const PIPE_BOARD_COLUMN_COLORS: Record<PipeBoardColumn, PipeStageBoardColors> = {
  PROSPECTION: PIPE_STAGE_BOARD_COLORS.PROSPECTION,
  R1_POSITIONNE: PIPE_STAGE_BOARD_COLORS.R1,
  R1_REALISE: R1_REALISE_COLORS,
  R2_POSITIONNE: PIPE_STAGE_BOARD_COLORS.R2,
  R2_REALISE: R2_REALISE_COLORS,
  R3_POSITIONNE: PIPE_STAGE_BOARD_COLORS.R3,
  R3_REALISE: R3_REALISE_COLORS,
  GAGNEE: PIPE_STAGE_BOARD_COLORS.GAGNEE,
  PERDUE_OU_EN_ATTENTE: PIPE_STAGE_BOARD_COLORS.PERDUE_OU_EN_ATTENTE,
};

export function getPipeStageBadgeClasses(stage: PipeStage): string {
  return PIPE_STAGE_BOARD_COLORS[stage].badge;
}

export function getPipeBoardColumnBadgeClasses(column: PipeBoardColumn): string {
  return PIPE_BOARD_COLUMN_COLORS[column].badge;
}
