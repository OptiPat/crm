import { formatCalendarDateFr } from "@/lib/dates/calendar-date";
import type { SetTacheStatutResult, Tache } from "@/lib/api/tauri-taches";

export function spawnedNextTacheToastMessage(result: SetTacheStatutResult): string | null {
  const next = result.spawned_next;
  if (!next?.date_echeance) return null;
  return `Prochaine occurrence : ${formatCalendarDateFr(next.date_echeance)}`;
}

export function hasActiveRecurrence(tache: Tache): boolean {
  return tache.recurrence != null && Boolean(tache.recurrence.freq);
}
