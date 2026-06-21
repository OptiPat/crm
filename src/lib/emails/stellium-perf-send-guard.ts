import type { EtiquetteEmailQueueItem } from "@/lib/api/tauri-etiquettes";
import { parseScpiDigestVersion } from "@/lib/emails/scpi-digest-stale";
import {
  isStelliumPerfQueueItem,
  parseStelliumPerfCampaignVariables,
  templateUsesStelliumPerfVariables,
} from "@/lib/emails/stellium-perf-preview-vars";

/** Aligné sur `STELLIUM_PERF_DIGEST_VERSION` (Rust). */
export const CURRENT_STELLIUM_PERF_DIGEST_VERSION = 9;

export function isStelliumPerfDigestStale(
  raw: string | null | undefined,
  currentVersion = CURRENT_STELLIUM_PERF_DIGEST_VERSION
): boolean {
  if (!raw?.trim()) return false;
  return parseScpiDigestVersion(raw) < currentVersion;
}

export function isStelliumPerfContentMissing(item: EtiquetteEmailQueueItem): boolean {
  const hay = `${item.template_corps}\n${item.template_variables ?? ""}`;
  if (!templateUsesStelliumPerfVariables(hay)) return false;
  const campaign = parseStelliumPerfCampaignVariables(item.campaign_variables);
  return !campaign.encours?.trim() && !campaign.perf_detail?.trim() && !campaign.perf_resume?.trim();
}

/** Raison de blocage envoi perf Stellium (null = envoi autorisé pour ce contrôle). */
export function getStelliumPerfSendBlockReason(item: EtiquetteEmailQueueItem): string | null {
  if (!isStelliumPerfQueueItem(item)) return null;
  if (isStelliumPerfContentMissing(item)) {
    return "Relevé perf absent — relancez « Préparer emails perf » après l'import";
  }
  if (isStelliumPerfDigestStale(item.campaign_variables)) {
    return "Relevé perf périmé — relancez « Préparer emails perf »";
  }
  return null;
}

export function isStelliumPerfSendBlocked(item: EtiquetteEmailQueueItem): boolean {
  return getStelliumPerfSendBlockReason(item) != null;
}
