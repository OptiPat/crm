import { dateInputAddDays } from "@/lib/taches/tache-date-shortcuts";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Demain 18:00 local — défaut pour planifier l'appel après rebond SMS. */
export function defaultParrainageCallSchedule(nowMs: number = Date.now()): {
  dateInput: string;
  timeInput: string;
} {
  const tomorrowInput = dateInputAddDays(null, 1, nowMs);
  const d = new Date(nowMs);
  d.setDate(d.getDate() + 1);
  const localTomorrow = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  return {
    dateInput: localTomorrow || tomorrowInput,
    timeInput: "18:00",
  };
}

/** Date + heure locales (`YYYY-MM-DD`, `HH:mm`) → timestamp Unix. */
export function localDateTimeInputToUnix(
  dateInput: string,
  timeInput: string
): number | null {
  const trimmedDate = dateInput.trim();
  if (!trimmedDate) return null;
  const [year, month, day] = trimmedDate.split("-").map(Number);
  const [hour, minute] = (timeInput.trim() || "18:00").split(":").map(Number);
  if (!year || !month || !day) return null;
  const ms = new Date(year, month - 1, day, hour || 0, minute || 0, 0, 0).getTime();
  if (Number.isNaN(ms)) return null;
  return Math.floor(ms / 1000);
}
