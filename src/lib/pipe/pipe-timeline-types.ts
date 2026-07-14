export const PIPE_TIMELINE_USER_TYPES = [
  "APPEL",
  "RDV",
  "NOTE",
  "PROPOSITION",
  "ARBITRAGE",
  "REINVESTISSEMENT",
  "VERSEMENT_PARTENAIRE",
  "SOUSCRIPTION_PARTENAIRE",
] as const;

/** Journal rapide affaire / action — hors Stellium et envoi partenaire (sections dédiées). */
export const PIPE_TIMELINE_QUICK_ADD_TYPES = PIPE_TIMELINE_USER_TYPES.filter(
  (t) =>
    t !== "VERSEMENT_PARTENAIRE" &&
    t !== "SOUSCRIPTION_PARTENAIRE" &&
    t !== "ARBITRAGE" &&
    t !== "REINVESTISSEMENT"
);

export type PipeTimelineUserType = (typeof PIPE_TIMELINE_USER_TYPES)[number];

export type PipeTimelineType = PipeTimelineUserType | "CREATION" | "AVANCEMENT";

export const PIPE_TIMELINE_TYPE_LABELS: Record<PipeTimelineType, string> = {
  APPEL: "Appel",
  RDV: "RDV",
  NOTE: "Note",
  PROPOSITION: "Proposition",
  ARBITRAGE: "Arbitrage",
  REINVESTISSEMENT: "Réinvestissement",
  VERSEMENT_PARTENAIRE: "Versement partenaire",
  SOUSCRIPTION_PARTENAIRE: "Souscription partenaire",
  CREATION: "Création",
  AVANCEMENT: "Avancement",
};

export function isPipeTimelineUserType(value: string): value is PipeTimelineUserType {
  return (PIPE_TIMELINE_USER_TYPES as readonly string[]).includes(value);
}

export function defaultTimelineEntryTitle(type: PipeTimelineUserType): string {
  return PIPE_TIMELINE_TYPE_LABELS[type];
}

export function formatTimelineOccurredAt(ts: number): string {
  return new Date(ts * 1000).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function datetimeLocalToUnix(value: string): number {
  return Math.floor(new Date(value).getTime() / 1000);
}

export function unixToDatetimeLocalInput(ts?: number): string {
  const d = ts ? new Date(ts * 1000) : new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
