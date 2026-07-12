import { createCalendarRdv } from "@/lib/api/tauri-calendar";
import { getEmailConnectionStatus } from "@/lib/api/tauri-email-oauth";
import { runRelationAutoSync } from "@/lib/emails/relation-auto-sync";
import type { PipeRdvStage } from "@/lib/pipe/pipe-rdv-stage";
import type { PipeRecordLike } from "@/lib/pipe/pipe-types";
import type { RdvVisioOptions } from "@/lib/calendar/rdv-visio";
import { loadDefaultPipeRdvVisio, rdvVisioToApiPayload } from "@/lib/calendar/rdv-visio";

const PIPE_RDV_GOOGLE_CALENDAR_LABELS: Record<PipeRdvStage, string> = {
  R1: "Premier rendez-vous patrimonial",
  R2: "Présentation des solutions patrimoniales",
  R3: "Présentation des solutions patrimoniales",
};

export const PIPE_RDV_CALENDAR_DURATION_SEC = 3600;

export type PipeRdvCalendarSyncResult =
  | { synced: false; reason: "not_connected" | "no_contact" | "past" }
  | {
      synced: true;
      clientAlreadyAccepted: boolean;
      visioLink?: string | null;
      eventLocation?: string | null;
    }
  | { synced: false; reason: "error"; message: string };

export function isPipeRdvCalendarSyncEligible(
  startAtUnix: number,
  nowMs = Date.now()
): boolean {
  return startAtUnix * 1000 > nowMs;
}

/** Libellé agenda : nom puis prénom (ex. DUPONT Jean). Couple : « A & B ». */
export function formatPipeRdvCalendarContactLabel(
  contact: Pick<
    PipeRecordLike,
    "contact_prenom" | "contact_nom" | "secondary_contact_prenom" | "secondary_contact_nom"
  > & { secondary_contact_id?: number | null }
): string {
  const prenom = contact.contact_prenom?.trim() ?? "";
  const nom = contact.contact_nom?.trim() ?? "";
  const primary = [nom, prenom].filter(Boolean).join(" ") || "Contact";
  if (!contact.secondary_contact_id) return primary;
  const sp = contact.secondary_contact_prenom?.trim() ?? "";
  const sn = contact.secondary_contact_nom?.trim() ?? "";
  const secondary = [sn, sp].filter(Boolean).join(" ");
  return secondary ? `${primary} & ${secondary}` : primary;
}

export function formatPipeRdvGoogleCalendarTitle(
  rdvStage: PipeRdvStage,
  contactLabel: string
): string {
  const contact = contactLabel.trim() || "Contact";
  return `${PIPE_RDV_GOOGLE_CALENDAR_LABELS[rdvStage]} - ${contact}`;
}

export function pipeRdvCalendarEndAt(startAtUnix: number): number {
  return startAtUnix + PIPE_RDV_CALENDAR_DURATION_SEC;
}

export async function syncPipeRdvToGoogleCalendarIfConnected(options: {
  contactId: number;
  contactLabel: string;
  rdvStage: PipeRdvStage;
  startAtUnix: number;
  visio?: RdvVisioOptions;
  physicalAddress?: string | null;
  additionalAttendeeContactIds?: number[];
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
    options.contactLabel
  );
  const endAtUnix = pipeRdvCalendarEndAt(options.startAtUnix);
  const visio = options.visio ?? (await loadDefaultPipeRdvVisio());
  const visioPayload = rdvVisioToApiPayload(visio, options.physicalAddress);

  try {
    await createCalendarRdv({
      contactId: options.contactId,
      title,
      startAt: options.startAtUnix,
      endAt: endAtUnix,
      addGoogleMeet: visioPayload.addGoogleMeet,
      visioLink: visioPayload.visioLink,
      eventLocation: visioPayload.eventLocation,
      additionalAttendeeContactIds: options.additionalAttendeeContactIds,
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
