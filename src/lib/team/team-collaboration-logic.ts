export const TEAM_PRESENCE_POLL_MS = 10_000;
export const TEAM_PRESENCE_HEARTBEAT_MS = 30_000;
export const TEAM_LOCK_RENEW_MS = 30_000;

export interface TeamPresenceLike {
  actorId: string;
  actorDisplayName?: string | null;
}

export function filterOtherPresence<T extends TeamPresenceLike>(
  entries: T[],
  selfActorId: string | null | undefined
): T[] {
  const self = selfActorId?.trim().toLowerCase();
  if (!self) return entries;
  return entries.filter((entry) => entry.actorId.trim().toLowerCase() !== self);
}

export function formatPresenceBanner(
  others: TeamPresenceLike[],
  maxNames = 2
): string | null {
  if (others.length === 0) return null;
  const labels = others.map(
    (entry) => entry.actorDisplayName?.trim() || entry.actorId
  );
  const shown = labels.slice(0, maxNames);
  const suffix =
    labels.length > maxNames ? ` (+${labels.length - maxNames})` : "";
  const verb = shown.length > 1 ? "consultent" : "consulte";
  return `${shown.join(", ")}${suffix} ${verb} aussi cette fiche`;
}

export function shouldBlockEdit(lockHeldBy: string | null | undefined): boolean {
  return Boolean(lockHeldBy?.trim());
}

export function mergeLockRenewEtag(
  currentEtag: string | null | undefined,
  responseEtag: string | null | undefined
): string | null {
  const next = responseEtag?.trim();
  if (next) return next;
  const current = currentEtag?.trim();
  return current || null;
}
