import type { ScpiCampaignDashboard } from "@/lib/api/tauri-scpi-campaign";
import type { StelliumPerfCampaignDashboard } from "@/lib/api/tauri-stellium-perf-campaign";
import { formatEtiquetteSendDatetime } from "@/lib/etiquettes/etiquette-email-preview";

export type EmailCampaignRowKind = "scpi" | "stellium_perf";

export type EmailCampaignDashboardRow = {
  kind: EmailCampaignRowKind;
  label: string;
  periode: string;
  preparedAt: number | null;
  readyCount: number;
  sentCount: number;
  active: boolean;
};

export function buildEmailCampaignRows(
  scpi: ScpiCampaignDashboard | null,
  stellium: StelliumPerfCampaignDashboard | null
): EmailCampaignDashboardRow[] {
  const rows: EmailCampaignDashboardRow[] = [];

  const scpiLast = scpi?.lastPrepare;
  const scpiReady = scpi?.readyCount ?? 0;
  const scpiSent = scpi?.sentSincePrepare ?? 0;
  if (scpiLast || scpiReady > 0 || scpiSent > 0) {
    rows.push({
      kind: "scpi",
      label: "Bulletins SCPI",
      periode: scpiLast?.periode ?? "—",
      preparedAt: scpiLast?.preparedAt ?? null,
      readyCount: scpiReady,
      sentCount: scpiSent,
      active: scpiReady > 0,
    });
  }

  const stLast = stellium?.lastPrepare;
  const stReady = stellium?.readyCount ?? 0;
  const stSent = stellium?.sentSincePrepare ?? 0;
  if (stLast || stReady > 0 || stSent > 0) {
    rows.push({
      kind: "stellium_perf",
      label: "Perf contrats Stellium",
      periode: stLast?.periode ?? "—",
      preparedAt: stLast?.preparedAt ?? null,
      readyCount: stReady,
      sentCount: stSent,
      active: stReady > 0,
    });
  }

  return rows;
}

export function formatCampaignPreparedAt(unix: number | null): string {
  if (unix == null || !Number.isFinite(unix)) return "—";
  return formatEtiquetteSendDatetime(unix);
}
