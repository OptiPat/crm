import type { PipeTimelineEntryRecord } from "@/lib/api/tauri-pipe-timeline";
import { isSuiviRdvEntry, formatSuiviRdvDisplayLabel } from "@/lib/pipe/pipe-suivi";
import { formatRdvTimelineTraceBadge, parseRdvTimelineTraceNote } from "@/lib/pipe/pipe-rdv-delete";
import { PIPE_STAGE_BOARD_COLORS } from "@/lib/pipe/pipe-stage-colors";
import {
  isPipeStage,
  PIPE_STAGE_LABELS,
  PIPE_STAGES,
  type PipeStage,
} from "@/lib/pipe/pipe-types";
import {
  PIPE_TIMELINE_TYPE_LABELS,
  type PipeTimelineType,
  type PipeTimelineUserType,
} from "@/lib/pipe/pipe-timeline-types";

const ADVANCEMENT_TITLE_PREFIX = "Avancement passé à ";
const LEGACY_CREATION_TITLE = "Pipe créé";
export const PIPE_TIMELINE_PROSPECTION_STAGE: PipeStage = "PROSPECTION";

export interface PipeTimelineDisplayContext {
  pipeType?: string;
}

export function advancementStageFromTimelineEntry(
  entry: Pick<PipeTimelineEntryRecord, "entry_type" | "titre">
): PipeStage | null {
  if (entry.entry_type !== "AVANCEMENT") return null;
  const titre = entry.titre?.trim() ?? "";
  if (isPipeStage(titre)) return titre;
  if (!titre.startsWith(ADVANCEMENT_TITLE_PREFIX)) return null;
  const label = titre.slice(ADVANCEMENT_TITLE_PREFIX.length).trim();
  for (const stage of PIPE_STAGES) {
    if (PIPE_STAGE_LABELS[stage] === label) return stage;
  }
  return null;
}

export function timelineStageFromEntry(
  entry: Pick<PipeTimelineEntryRecord, "entry_type" | "titre">,
  context?: PipeTimelineDisplayContext
): PipeStage | null {
  if (entry.entry_type === "CREATION") {
    return context?.pipeType === "AFFAIRE" ? PIPE_TIMELINE_PROSPECTION_STAGE : null;
  }
  if (entry.entry_type === "AVANCEMENT") {
    return advancementStageFromTimelineEntry(entry);
  }
  return null;
}

export function isStageMilestoneEntry(entryType: string): boolean {
  return entryType === "CREATION" || entryType === "AVANCEMENT";
}

export interface PipeTimelineEntryStyle {
  badge: string;
  card: string;
  dot: string;
}

const USER_TYPE_STYLES: Record<PipeTimelineUserType, PipeTimelineEntryStyle> = {
  APPEL: {
    badge:
      "bg-sky-100 text-sky-800 border-sky-200/80 dark:bg-sky-950 dark:text-sky-200 dark:border-sky-800",
    card: "border-sky-200/60 bg-sky-50/30 dark:border-sky-900 dark:bg-sky-950/20",
    dot: "bg-sky-500 ring-sky-200 dark:ring-sky-900",
  },
  RDV: {
    badge:
      "bg-blue-100 text-blue-800 border-blue-200/80 dark:bg-blue-950 dark:text-blue-200 dark:border-blue-800",
    card: "border-blue-200/60 bg-blue-50/30 dark:border-blue-900 dark:bg-blue-950/20",
    dot: "bg-blue-500 ring-blue-200 dark:ring-blue-900",
  },
  NOTE: {
    badge:
      "bg-slate-100 text-slate-700 border-slate-200/80 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-600",
    card: "border-slate-200/60 bg-slate-50/40 dark:border-slate-700 dark:bg-slate-950/25",
    dot: "bg-slate-500 ring-slate-200 dark:ring-slate-800",
  },
  PROPOSITION: {
    badge:
      "bg-violet-100 text-violet-800 border-violet-200/80 dark:bg-violet-950 dark:text-violet-200 dark:border-violet-800",
    card: "border-violet-200/60 bg-violet-50/30 dark:border-violet-900 dark:bg-violet-950/20",
    dot: "bg-violet-500 ring-violet-200 dark:ring-violet-900",
  },
  ARBITRAGE: {
    badge:
      "bg-amber-100 text-amber-900 border-amber-200/80 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800",
    card: "border-amber-200/60 bg-amber-50/30 dark:border-amber-900 dark:bg-amber-950/20",
    dot: "bg-amber-500 ring-amber-200 dark:ring-amber-900",
  },
  REINVESTISSEMENT: {
    badge:
      "bg-emerald-100 text-emerald-800 border-emerald-200/80 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-800",
    card: "border-emerald-200/60 bg-emerald-50/30 dark:border-emerald-900 dark:bg-emerald-950/20",
    dot: "bg-emerald-500 ring-emerald-200 dark:ring-emerald-900",
  },
};

const STAGE_DOTS: Record<PipeStage, string> = {
  PROSPECTION: "bg-slate-400 dark:bg-slate-500",
  R1: "bg-sky-500",
  R2: "bg-blue-500",
  R3: "bg-violet-500",
  GAGNEE: "bg-emerald-500",
  PERDUE_OU_EN_ATTENTE: "bg-amber-500",
};

export function getPipeTimelineEntryStyle(
  entry: Pick<PipeTimelineEntryRecord, "entry_type" | "titre" | "contenu">,
  context?: PipeTimelineDisplayContext
): PipeTimelineEntryStyle {
  if (entry.entry_type === "NOTE" && parseRdvTimelineTraceNote(entry.contenu)) {
    return USER_TYPE_STYLES.RDV;
  }

  const stage = timelineStageFromEntry(entry, context);
  if (stage) {
    const colors = PIPE_STAGE_BOARD_COLORS[stage];
    return {
      badge: colors.badge,
      card: `${colors.column} border`,
      dot: STAGE_DOTS[stage],
    };
  }

  if (entry.entry_type in USER_TYPE_STYLES) {
    return USER_TYPE_STYLES[entry.entry_type as PipeTimelineUserType];
  }

  return {
    badge: "bg-muted text-muted-foreground border-border",
    card: "border-border/70 bg-card",
    dot: "bg-muted-foreground ring-border",
  };
}

export function isPipeTimelineSystemEntry(entryType: string): entryType is "CREATION" | "AVANCEMENT" {
  return entryType === "CREATION" || entryType === "AVANCEMENT";
}

export function isPipeTimelineType(value: string): value is PipeTimelineType {
  return (
    value === "CREATION" ||
    value === "AVANCEMENT" ||
    value === "APPEL" ||
    value === "RDV" ||
    value === "NOTE" ||
    value === "PROPOSITION" ||
    value === "ARBITRAGE" ||
    value === "REINVESTISSEMENT"
  );
}

export function formatTimelineEntryBadgeLabel(
  entry: Pick<PipeTimelineEntryRecord, "entry_type" | "titre" | "contenu">,
  context?: PipeTimelineDisplayContext
): string {
  if (entry.entry_type === "NOTE") {
    const traceBadge = formatRdvTimelineTraceBadge(entry.contenu);
    if (traceBadge) return traceBadge;
  }

  if (isSuiviRdvEntry(entry)) {
    return formatSuiviRdvDisplayLabel();
  }

  const stage = timelineStageFromEntry(entry, context);
  if (stage) return PIPE_STAGE_LABELS[stage];
  return (
    PIPE_TIMELINE_TYPE_LABELS[entry.entry_type as keyof typeof PIPE_TIMELINE_TYPE_LABELS] ??
    entry.entry_type
  );
}

/** Jalons d'étape : pas de titre redondant, seulement les notes. */
export function formatTimelineEntryTitre(
  entry: Pick<PipeTimelineEntryRecord, "entry_type" | "titre">
): string | null {
  if (isStageMilestoneEntry(entry.entry_type)) return null;
  if (isSuiviRdvEntry(entry)) return null;
  const titre = entry.titre?.trim();
  if (!titre || titre === LEGACY_CREATION_TITLE) return null;
  return titre;
}

export function formatTimelineEntryContenu(
  entry: Pick<PipeTimelineEntryRecord, "contenu">
): string | null {
  const contenu = entry.contenu?.trim();
  return contenu || null;
}
