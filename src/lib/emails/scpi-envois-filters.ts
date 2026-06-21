import type { EtiquetteEmailQueueItem } from "@/lib/api/tauri-etiquettes";
import { isScpiBulletinQueueItem } from "@/lib/emails/scpi-bulletin-preview-vars";

/** Dossier n8n pour dépôt PDF (doc SCPI_TRIMESTRE.md). */
export const SCPI_PDF_DROP_FOLDER = "D:\\n8n_bridge\\scpi\\a-traiter";

export const SCPI_BULLETIN_TEMPLATE_LABEL = "Bulletin SCPI trimestriel";

export function parseScpiQueuePeriod(
  item: Pick<EtiquetteEmailQueueItem, "campaign_variables">
): string | null {
  const raw = item.campaign_variables;
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as { periode?: unknown };
    return typeof parsed.periode === "string" && parsed.periode.trim()
      ? parsed.periode.trim()
      : null;
  } catch {
    return null;
  }
}

export function filterScpiBulletinReadyItems(
  items: EtiquetteEmailQueueItem[]
): EtiquetteEmailQueueItem[] {
  return items.filter(isScpiBulletinQueueItem);
}

export function filterReadyByScpiBatch(
  items: EtiquetteEmailQueueItem[],
  periode: string | null | undefined
): EtiquetteEmailQueueItem[] {
  const scpi = filterScpiBulletinReadyItems(items);
  if (!periode?.trim()) return scpi;
  const p = periode.trim();
  return scpi.filter((item) => parseScpiQueuePeriod(item) === p);
}

export function countNonScpiReadyItems(
  ready: EtiquetteEmailQueueItem[],
  scpiReadyCount: number
): number {
  return Math.max(0, ready.length - scpiReadyCount);
}

export function isScpiBulletinLogEntry(entry: {
  template_nom?: string | null;
  etiquette_nom?: string | null;
}): boolean {
  const hay = `${entry.template_nom ?? ""} ${entry.etiquette_nom ?? ""}`;
  return hay.includes(SCPI_BULLETIN_TEMPLATE_LABEL);
}
