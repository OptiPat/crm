import { createCalendarRdv } from "@/lib/api/tauri-calendar";
import { getEmailConnectionStatus } from "@/lib/api/tauri-email-oauth";
import { runRelationAutoSync } from "@/lib/emails/relation-auto-sync";
import { formatRdvStageLabel, type PipeRdvStage } from "@/lib/pipe/pipe-rdv-stage";

export const PIPE_RDV_CALENDAR_DURATION_SEC = 3600;

export type PipeRdvCalendarSyncResult =
  | { synced: false; reason: "not_connected" | "no_contact" | "past" }
  | { synced: true; clientAlreadyAccepted: boolean }
  | { synced: false; reason: "error"; message: string };

export function isPipeRdvCalendarSyncEligible(
  startAtUnix: number,
  nowMs = Date.now()
): boolean {
  return startAtUnix * 1000 > nowMs;
}

export function formatPipeRdvGoogleCalendarTitle(
  rdvStage: PipeRdvStage,
  contactLabel: string,
  pipeTitre?: string | null
): string {
  const contact = contactLabel.trim() || "Contact";
  const base = `RDV ${formatRdvStageLabel(rdvStage)} — ${contact}`;
  const pipeTitle = pipeTitre?.trim();
  return pipeTitle ? `${base} (${pipeTitle})` : base;
}

export function pipeRdvCalendarEndAt(startAtUnix: number): number {
  return startAtUnix + PIPE_RDV_CALENDAR_DURATION_SEC;
}

export async function syncPipeRdvToGoogleCalendarIfConnected(options: {
  contactId: number;
  contactLabel: string;
  pipeTitre?: string | null;
  rdvStage: PipeRdvStage;
  startAtUnix: number;
}): Promise<PipeRdvCalendarSyncResult> {
  if (options.contactId <= 0) {
    return { synced: false, reason: "no_contact" };
  }

  let calendarConnected = false;
  try {
    const status = await getEmailConnectionStatus();
    calendarConnected = status.google_calendar_connected;
  } catch {
    return { synced: false, reason: "not_connected" };
  }

  if (!calendarConnected) {
    return { synced: false, reason: "not_connected" };
  }

  if (!isPipeRdvCalendarSyncEligible(options.startAtUnix)) {
    return { synced: false, reason: "past" };
  }

  const title = formatPipeRdvGoogleCalendarTitle(
    options.rdvStage,
    options.contactLabel,
    options.pipeTitre
  );
  const endAtUnix = pipeRdvCalendarEndAt(options.startAtUnix);

  try {
    await createCalendarRdv({
      contactId: options.contactId,
      title,
      startAt: options.startAtUnix,
      endAt: endAtUnix,
    });
  } catch (e) {
    return {
      synced: false,
      reason: "error",
      message: e instanceof Error ? e.message : String(e),
    };
  }

  let clientAlreadyAccepted = false;
  try {
    const sync = await runRelationAutoSync();
    clientAlreadyAccepted = sync.calendar_accepted > 0;
  } catch {
    // RDV créé — sync statut optionnelle
  }

  return { synced: true, clientAlreadyAccepted };
}
