/** Aligné sur `SCPI_CAMPAIGN_DIGEST_VERSION` (Rust). Incrémenter si le format digest change. */
export const CURRENT_SCPI_DIGEST_VERSION = 1;

export function parseScpiDigestVersion(raw: string | null | undefined): number {
  if (!raw?.trim()) return 0;
  try {
    const parsed = JSON.parse(raw) as { digest_version?: unknown };
    return typeof parsed.digest_version === "number" ? parsed.digest_version : 0;
  } catch {
    return 0;
  }
}

/** Digest préparé avant une mise à jour CRM / template — relancer n8n prepare. */
export function isScpiDigestStale(
  raw: string | null | undefined,
  currentVersion = CURRENT_SCPI_DIGEST_VERSION
): boolean {
  if (!raw?.trim()) return false;
  return parseScpiDigestVersion(raw) < currentVersion;
}
