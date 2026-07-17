import type { PipeContactTimelineEntry } from "@/lib/api/tauri-pipe-contact-timeline";
import { listPipeTimelineForContact } from "@/lib/api/tauri-pipe-contact-timeline";
import { isRdvTimelineTraceNote } from "@/lib/pipe/pipe-rdv-delete";
import {
  formatTimelineEntryBadgeLabel,
  formatTimelineEntryContenu,
  formatTimelineEntryTitre,
} from "@/lib/pipe/pipe-timeline-display";
import { PIPE_STAGE_LABELS, PIPE_TYPE_LABELS, isPipeType } from "@/lib/pipe/pipe-types";

export interface ContactPipeTimelineMonthGroup {
  key: string;
  label: string;
  items: PipeContactTimelineEntry[];
}

export interface ContactPipeTimelineYearGroup {
  year: number;
  months: ContactPipeTimelineMonthGroup[];
}

const MONTH_LABELS = [
  "Janvier",
  "Février",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Août",
  "Septembre",
  "Octobre",
  "Novembre",
  "Décembre",
];

export function isRelationPipeEntryVisible(entry: PipeContactTimelineEntry): boolean {
  if (entry.entry_type === "CREATION") return false;
  return !isRdvTimelineTraceNote({
    id: entry.id,
    pipe_id: entry.pipe_id,
    entry_type: entry.entry_type,
    titre: entry.titre ?? null,
    contenu: entry.contenu ?? null,
    occurred_at: entry.occurred_at,
    created_at: entry.created_at,
    google_event_id: entry.google_event_id ?? null,
  });
}

export function filterVisibleContactPipeEntries(
  entries: PipeContactTimelineEntry[]
): PipeContactTimelineEntry[] {
  return entries.filter(isRelationPipeEntryVisible);
}

/** Arbre année / mois — récent en haut, ancien en bas (inverse du détail Pipe). */
export function groupContactPipeTimelineByYearMonth(
  entries: PipeContactTimelineEntry[]
): ContactPipeTimelineYearGroup[] {
  const byYear = new Map<number, Map<number, PipeContactTimelineEntry[]>>();

  for (const entry of entries) {
    const d = new Date(entry.occurred_at * 1000);
    const year = d.getFullYear();
    const month = d.getMonth();
    if (!byYear.has(year)) byYear.set(year, new Map());
    const months = byYear.get(year)!;
    if (!months.has(month)) months.set(month, []);
    months.get(month)!.push(entry);
  }

  return [...byYear.entries()]
    .sort(([a], [b]) => b - a)
    .map(([year, monthsMap]) => ({
      year,
      months: [...monthsMap.entries()]
        .sort(([a], [b]) => b - a)
        .map(([month, monthItems]) => ({
          key: `${year}-${month + 1}`,
          label: MONTH_LABELS[month] ?? `Mois ${month + 1}`,
          items: monthItems.sort(
            (a, b) => b.occurred_at - a.occurred_at || b.id - a.id
          ),
        })),
    }));
}

export function contactPipeTimelineMatchesSearch(
  entry: PipeContactTimelineEntry,
  query: string
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const displayContext = {
    pipeType: entry.pipe_type,
    timelineEntries: [],
  };
  const hay = [
    entry.pipe_titre,
    entry.pipe_type,
    entry.pipe_stage,
    PIPE_STAGE_LABELS[entry.pipe_stage as keyof typeof PIPE_STAGE_LABELS],
    pipeRelationTypeLabel(entry.pipe_type),
    formatTimelineEntryBadgeLabel(entry, displayContext),
    formatTimelineEntryTitre(entry),
    formatTimelineEntryContenu(entry),
    entry.contenu,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

export async function loadContactPipeTimeline(
  contactId: number
): Promise<PipeContactTimelineEntry[]> {
  const entries = await listPipeTimelineForContact(contactId);
  return filterVisibleContactPipeEntries(entries);
}

export function pipeRelationTypeLabel(pipeType: string): string {
  return isPipeType(pipeType) ? PIPE_TYPE_LABELS[pipeType] : pipeType;
}

export function pipeRelationEntryLabel(entry: PipeContactTimelineEntry): {
  badge: string;
  title: string;
  subtitle: string | null;
} {
  const displayContext = {
    pipeType: entry.pipe_type,
    timelineEntries: [],
  };
  return {
    badge: formatTimelineEntryBadgeLabel(entry, displayContext),
    title: formatTimelineEntryTitre(entry) ?? formatTimelineEntryBadgeLabel(entry, displayContext),
    subtitle: formatTimelineEntryContenu(entry),
  };
}
