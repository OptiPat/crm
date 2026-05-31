import type { ContactGmailMessage } from "@/lib/api/tauri-contact-gmail";

export interface GmailHistoryMonthGroup {
  key: string;
  label: string;
  items: ContactGmailMessage[];
}

export interface GmailHistoryYearGroup {
  year: number;
  months: GmailHistoryMonthGroup[];
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

export function groupContactGmailMessages(
  messages: ContactGmailMessage[]
): GmailHistoryYearGroup[] {
  const byYear = new Map<number, Map<number, ContactGmailMessage[]>>();

  for (const msg of messages) {
    const d = new Date(msg.sent_at * 1000);
    const year = d.getFullYear();
    const month = d.getMonth();
    if (!byYear.has(year)) byYear.set(year, new Map());
    const months = byYear.get(year)!;
    if (!months.has(month)) months.set(month, []);
    months.get(month)!.push(msg);
  }

  return [...byYear.entries()]
    .sort(([a], [b]) => b - a)
    .map(([year, monthsMap]) => ({
      year,
      months: [...monthsMap.entries()]
        .sort(([a], [b]) => b - a)
        .map(([month, items]) => ({
          key: `${year}-${month + 1}`,
          label: MONTH_LABELS[month] ?? `Mois ${month + 1}`,
          items: items.sort((a, b) => b.sent_at - a.sent_at),
        })),
    }));
}
