import type { ContactRelationTimelineItem } from "@/lib/interactions/contact-relation-timeline";

export interface RelationTimelineMonthGroup {
  key: string;
  label: string;
  items: ContactRelationTimelineItem[];
}

export interface RelationTimelineYearGroup {
  year: number;
  months: RelationTimelineMonthGroup[];
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

export function groupRelationTimelineByYearMonth(
  items: ContactRelationTimelineItem[]
): RelationTimelineYearGroup[] {
  const byYear = new Map<number, Map<number, ContactRelationTimelineItem[]>>();

  for (const item of items) {
    const d = new Date(item.sort_date * 1000);
    const year = d.getFullYear();
    const month = d.getMonth();
    if (!byYear.has(year)) byYear.set(year, new Map());
    const months = byYear.get(year)!;
    if (!months.has(month)) months.set(month, []);
    months.get(month)!.push(item);
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
          items: monthItems.sort((a, b) => b.sort_date - a.sort_date),
        })),
    }));
}
