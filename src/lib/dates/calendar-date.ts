/** Durées calendaires alignées sur le backend Rust (operations.rs). */
export const JOURS_6_MOIS = 180;
export const JOURS_1_AN = 365;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Timestamp Unix → `YYYY-MM-DD` (jour calendaire UTC, pour `<input type="date">`). */
export function unixToDateInput(ts: number): string {
  const date = new Date(ts * 1000);
  if (isNaN(date.getTime())) return "";
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

/** `YYYY-MM-DD` (`<input type="date">`) → timestamp Unix (minuit UTC). `null` si vide. */
export function dateInputToUnix(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(`${value}T00:00:00Z`);
  if (isNaN(ms)) return null;
  return Math.floor(ms / 1000);
}

/** Timestamp Unix → `JJ/MM/AAAA` (jour calendaire UTC, affichage FR). */
export function formatCalendarDateFr(ts: number): string {
  const date = new Date(ts * 1000);
  if (isNaN(date.getTime())) return "";
  return `${pad2(date.getUTCDate())}/${pad2(date.getUTCMonth() + 1)}/${date.getUTCFullYear()}`;
}

/** Nombre de jours entre un timestamp passé et maintenant. */
export function daysSinceUnix(ts: number, nowMs: number = Date.now()): number {
  return Math.floor((nowMs - ts * 1000) / (1000 * 60 * 60 * 24));
}
