import type { PipeStage } from "./pipe-types";

export interface PipeStageBoardColors {
  column: string;
  accent: string;
  header: string;
  title: string;
  badge: string;
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
  },
  R1: {
    column: "border-sky-200/70 bg-sky-50/40 dark:border-sky-900 dark:bg-sky-950/25",
    accent: "border-t-sky-400 dark:border-t-sky-500",
    header: "border-sky-200/50 dark:border-sky-900",
    title: "text-sky-800 dark:text-sky-300",
    badge:
      "bg-sky-100 text-sky-800 border border-sky-200/80 dark:bg-sky-950 dark:text-sky-200 dark:border-sky-800",
  },
  R2: {
    column: "border-blue-200/70 bg-blue-50/40 dark:border-blue-900 dark:bg-blue-950/25",
    accent: "border-t-blue-500 dark:border-t-blue-500",
    header: "border-blue-200/50 dark:border-blue-900",
    title: "text-blue-800 dark:text-blue-300",
    badge:
      "bg-blue-100 text-blue-800 border border-blue-200/80 dark:bg-blue-950 dark:text-blue-200 dark:border-blue-800",
  },
  R3: {
    column:
      "border-violet-200/70 bg-violet-50/40 dark:border-violet-900 dark:bg-violet-950/25",
    accent: "border-t-violet-500 dark:border-t-violet-500",
    header: "border-violet-200/50 dark:border-violet-900",
    title: "text-violet-800 dark:text-violet-300",
    badge:
      "bg-violet-100 text-violet-800 border border-violet-200/80 dark:bg-violet-950 dark:text-violet-200 dark:border-violet-800",
  },
  GAGNEE: {
    column:
      "border-emerald-200/70 bg-emerald-50/45 dark:border-emerald-900 dark:bg-emerald-950/25",
    accent: "border-t-emerald-500 dark:border-t-emerald-500",
    header: "border-emerald-200/50 dark:border-emerald-900",
    title: "text-emerald-800 dark:text-emerald-300",
    badge:
      "bg-emerald-100 text-emerald-800 border border-emerald-200/80 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-800",
  },
  PERDUE_OU_EN_ATTENTE: {
    column:
      "border-amber-200/70 bg-amber-50/40 dark:border-amber-900 dark:bg-amber-950/25",
    accent: "border-t-amber-500 dark:border-t-amber-500",
    header: "border-amber-200/50 dark:border-amber-900",
    title: "text-amber-900 dark:text-amber-300",
    badge:
      "bg-amber-100 text-amber-900 border border-amber-200/80 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800",
  },
};

export function getPipeStageBadgeClasses(stage: PipeStage): string {
  return PIPE_STAGE_BOARD_COLORS[stage].badge;
}
