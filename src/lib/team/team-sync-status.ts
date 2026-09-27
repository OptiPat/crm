import type { TeamSyncOnceReport } from "@/lib/team/team-capabilities";

/**
 * Message du bandeau après un cycle de synchronisation, ou null si tout va bien.
 * Les conflits passent avant les refus : ils demandent un arbitrage humain.
 */
export function teamSyncReportMessage(report: TeamSyncOnceReport): string | null {
  if (report.conflicts > 0) {
    return `${report.conflicts} conflit(s) de synchronisation à résoudre.`;
  }
  const failed = report.failed ?? 0;
  if (failed > 0) {
    const detail = report.lastError?.trim();
    const base = `${failed} ligne(s) refusée(s) par SharePoint — nouvel essai au prochain cycle.`;
    return detail ? `${base} ${detail}` : base;
  }
  return null;
}
