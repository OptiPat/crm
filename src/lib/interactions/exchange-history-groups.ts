import type { ExchangeHistoryEntry } from "@/lib/api/tauri-interactions";

export interface ExchangeHistoryMonthGroup {
  key: string;
  label: string;
  entries: ExchangeHistoryEntry[];
}

export interface ExchangeHistoryYearGroup {
  year: number;
  months: ExchangeHistoryMonthGroup[];
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

export function groupExchangeHistoryByYearMonth(
  entries: ExchangeHistoryEntry[]
): ExchangeHistoryYearGroup[] {
  const byYear = new Map<number, Map<number, ExchangeHistoryEntry[]>>();

  for (const entry of entries) {
    const d = new Date(entry.sort_date * 1000);
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
        .map(([month, monthEntries]) => ({
          key: `${year}-${month + 1}`,
          label: MONTH_LABELS[month] ?? `Mois ${month + 1}`,
          entries: monthEntries.sort((a, b) => b.sort_date - a.sort_date),
        })),
    }));
}
