/** Nom de la boîte mail connectée (Google → Gmail, Microsoft → Outlook), sinon libellé neutre. */
export function newsletterMailboxLabel(provider: string | null | undefined): string {
  const p = provider?.trim().toLowerCase();
  if (p === "google" || p === "gmail") return "Gmail";
  if (p === "microsoft" || p === "outlook") return "Outlook";
  return "votre boîte mail";
}

/** Durée estimée d'un envoi échelonné : « moins d'une minute », « environ 12 min », « environ 1 h 05 ». */
export function formatEstimatedSendDuration(count: number, delayMs: number): string {
  const totalSeconds = (Math.max(0, count) * Math.max(0, delayMs)) / 1000;
  if (totalSeconds < 60) return "moins d'une minute";
  const minutes = Math.ceil(totalSeconds / 60);
  if (minutes < 60) return `environ ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `environ ${hours} h` : `environ ${hours} h ${String(rest).padStart(2, "0")}`;
}
