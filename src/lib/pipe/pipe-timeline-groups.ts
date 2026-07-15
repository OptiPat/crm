import type { PipeTimelineEntryRecord } from "@/lib/api/tauri-pipe-timeline";

export interface PipeTimelineMonthGroup {
  key: string;
  label: string;
  items: PipeTimelineEntryRecord[];
}

export interface PipeTimelineYearGroup {
  year: number;
  months: PipeTimelineMonthGroup[];
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

export function groupPipeTimelineByYearMonth(
  entries: PipeTimelineEntryRecord[]
): PipeTimelineYearGroup[] {
  const byYear = new Map<number, Map<number, PipeTimelineEntryRecord[]>>();

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
    .sort(([a], [b]) => a - b)
    .map(([year, monthsMap]) => ({
      year,
      months: [...monthsMap.entries()]
        .sort(([a], [b]) => a - b)
        .map(([month, monthItems]) => ({
          key: `${year}-${month + 1}`,
          label: MONTH_LABELS[month] ?? `Mois ${month + 1}`,
          items: monthItems.sort((a, b) => a.occurred_at - b.occurred_at || a.id - b.id),
        })),
    }));
}
