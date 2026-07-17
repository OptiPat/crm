export function shouldAutoLock(
  nowMs: number,
  lastActivityMs: number,
  timeoutMinutes: number,
): boolean {
  if (!Number.isFinite(timeoutMinutes) || timeoutMinutes <= 0) return false;
  return nowMs - lastActivityMs >= timeoutMinutes * 60_000;
}
