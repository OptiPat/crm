/** Quota / rate-limit Gmail ou Graph — un nouvel essai une minute plus tard a du sens. */
export function isTransientEmailSendError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("ratelimitexceeded") ||
    lower.includes("rate_limit_exceeded") ||
    lower.includes("rate limit") ||
    lower.includes("quota exceeded") ||
    lower.includes("usagelimits") ||
    lower.includes("too many requests") ||
    lower.includes("429") ||
    (lower.includes("403") &&
      (lower.includes("quota") || lower.includes("rate") || lower.includes("limit")))
  );
}

export function humanizeTransientEmailSendError(raw: string): string {
  if (isTransientEmailSendError(raw)) {
    return "Gmail saturé (quota minute) — nouvel essai automatique dans 1 min.";
  }
  return raw;
}
