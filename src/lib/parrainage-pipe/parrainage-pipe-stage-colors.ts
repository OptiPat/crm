import type { ParrainagePipeStage } from "./parrainage-pipe-types";

export interface ParrainagePipeStageBoardColors {
  column: string;
  accent: string;
  header: string;
  title: string;
  badge: string;
}

/** Couleurs funnel parrainage — même structure visuelle que le pipe client. */
export const PARRAINAGE_PIPE_STAGE_BOARD_COLORS: Record<
  ParrainagePipeStage,
  ParrainagePipeStageBoardColors
> = {
  A_CONTACTER: {
    column:
      "border-slate-200/70 bg-slate-50/50 dark:border-slate-700/80 dark:bg-slate-950/30",
    accent: "border-t-slate-400 dark:border-t-slate-500",
    header: "border-slate-200/60 dark:border-slate-700/80",
    title: "text-slate-700 dark:text-slate-300",
    badge:
      "bg-slate-100 text-slate-700 border border-slate-200/80 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-600",
  },
  ATTENTE_REPONSE: {
    column:
      "border-indigo-200/70 bg-indigo-50/40 dark:border-indigo-900 dark:bg-indigo-950/25",
    accent: "border-t-indigo-400 dark:border-t-indigo-500",
    header: "border-indigo-200/50 dark:border-indigo-900",
    title: "text-indigo-800 dark:text-indigo-300",
    badge:
      "bg-indigo-100 text-indigo-800 border border-indigo-200/80 dark:bg-indigo-950 dark:text-indigo-200 dark:border-indigo-800",
  },
  PRISE_DE_CONTACT: {
    column: "border-sky-200/70 bg-sky-50/40 dark:border-sky-900 dark:bg-sky-950/25",
    accent: "border-t-sky-400 dark:border-t-sky-500",
    header: "border-sky-200/50 dark:border-sky-900",
    title: "text-sky-800 dark:text-sky-300",
    badge:
      "bg-sky-100 text-sky-800 border border-sky-200/80 dark:bg-sky-950 dark:text-sky-200 dark:border-sky-800",
  },
  CONFIRME: {
    column:
      "border-violet-200/70 bg-violet-50/40 dark:border-violet-900 dark:bg-violet-950/25",
    accent: "border-t-violet-500 dark:border-t-violet-500",
    header: "border-violet-200/50 dark:border-violet-900",
    title: "text-violet-800 dark:text-violet-300",
    badge:
      "bg-violet-100 text-violet-800 border border-violet-200/80 dark:bg-violet-950 dark:text-violet-200 dark:border-violet-800",
  },
  REPORTE: {
    column:
      "border-orange-200/70 bg-orange-50/40 dark:border-orange-900 dark:bg-orange-950/25",
    accent: "border-t-orange-500 dark:border-t-orange-500",
    header: "border-orange-200/50 dark:border-orange-900",
    title: "text-orange-900 dark:text-orange-300",
    badge:
      "bg-orange-100 text-orange-900 border border-orange-200/80 dark:bg-orange-950 dark:text-orange-200 dark:border-orange-800",
  },
  PRESENT: {
    column:
      "border-amber-200/70 bg-amber-50/40 dark:border-amber-900 dark:bg-amber-950/25",
    accent: "border-t-amber-500 dark:border-t-amber-500",
    header: "border-amber-200/50 dark:border-amber-900",
    title: "text-amber-900 dark:text-amber-300",
    badge:
      "bg-amber-100 text-amber-900 border border-amber-200/80 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800",
  },
  INSCRIT: {
    column:
      "border-emerald-200/70 bg-emerald-50/45 dark:border-emerald-900 dark:bg-emerald-950/25",
    accent: "border-t-emerald-500 dark:border-t-emerald-500",
    header: "border-emerald-200/50 dark:border-emerald-900",
    title: "text-emerald-800 dark:text-emerald-300",
    badge:
      "bg-emerald-100 text-emerald-800 border border-emerald-200/80 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-800",
  },
  REFUSE: {
    column: "border-rose-200/70 bg-rose-50/40 dark:border-rose-900 dark:bg-rose-950/25",
    accent: "border-t-rose-500 dark:border-t-rose-500",
    header: "border-rose-200/50 dark:border-rose-900",
    title: "text-rose-800 dark:text-rose-300",
    badge:
      "bg-rose-100 text-rose-800 border border-rose-200/80 dark:bg-rose-950 dark:text-rose-200 dark:border-rose-800",
  },
};
