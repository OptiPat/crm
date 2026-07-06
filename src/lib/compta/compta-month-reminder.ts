export function shouldShowComptaMonthEndReminder(now: Date, year: number, month: number): boolean {
  const isSameMonth =
    year === now.getFullYear() && month === now.getMonth() + 1;
  if (!isSameMonth) return false;
  const lastDay = new Date(year, month, 0).getDate();
  return now.getDate() >= lastDay - 2;
}

export function comptaMonthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}
