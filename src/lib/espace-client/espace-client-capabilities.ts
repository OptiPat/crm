export const ESPACE_CLIENT_ACTIVE_SETTING = "espace_client_active";

/** Parse la clé `settings.espace_client_active` (posée manuellement, hors UI). */
export function parseEspaceClientActive(
  value: string | null | undefined
): boolean {
  if (!value?.trim()) return false;
  const normalized = value.trim().toLowerCase();
  return (
    normalized === "1" ||
    normalized === "true" ||
    normalized === "oui" ||
    normalized === "yes"
  );
}
