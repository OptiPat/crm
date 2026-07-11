import {
  cancelCalendarRdv,
  createCalendarRdv,
  updateCalendarRdv,
} from "@/lib/api/tauri-calendar";
import { createPipeTimelineEntry } from "@/lib/api/tauri-pipe-timeline";
import type { PipeRecord } from "@/lib/api/tauri-pipe";
import { getEmailConnectionStatus } from "@/lib/api/tauri-email-oauth";
import {
  formatPipeRdvCalendarContactLabel,
  formatPipeRdvGoogleCalendarTitle,
  isPipeRdvCalendarSyncEligible,
  type PipeRdvCalendarSyncResult,
} from "@/lib/pipe/pipe-rdv-google-calendar";
import {
  applyRdvStageOnSave,
  formatRdvEntryTitle,
  type PipeRdvStage,
} from "@/lib/pipe/pipe-rdv-stage";
import type { RdvVisioOptions } from "@/lib/calendar/rdv-visio";
import { loadDefaultPipeRdvVisio, rdvVisioToApiPayload } from "@/lib/calendar/rdv-visio";

export async function syncGoogleCalendarForPipeRdv(options: {
  contactId: number;
  contactLabel: string;
  rdvStage: PipeRdvStage;
  startAtUnix: number;
  endAtUnix: number;
  pipeTimelineEntryId?: number | null;
  existingGoogleEventId?: string | null;
  visio?: RdvVisioOptions;
  calendarTitle?: string | null;
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

  const title =
    options.calendarTitle?.trim() ||
    formatPipeRdvGoogleCalendarTitle(options.rdvStage, options.contactLabel);
  const preserveVisio = options.existingGoogleEventId != null && options.visio === undefined;
  const visio = options.visio ?? (preserveVisio ? undefined : await loadDefaultPipeRdvVisio());
  const visioPayload =
    visio != null
      ? rdvVisioToApiPayload(visio)
      : { addGoogleMeet: false, visioLink: null as string | null };

  try {
    if (options.existingGoogleEventId) {
      await updateCalendarRdv({
        googleEventId: options.existingGoogleEventId,
        title,
        startAt: options.startAtUnix,
        endAt: options.endAtUnix,
        preserveVisio,
        clearVisio: visio?.mode === "none",
        addGoogleMeet: visioPayload.addGoogleMeet,
        visioLink: visioPayload.visioLink,
      });
    } else {
      const createVisio = visio ?? (await loadDefaultPipeRdvVisio());
      const createPayload = rdvVisioToApiPayload(createVisio);
      await createCalendarRdv({
        contactId: options.contactId,
        pipeTimelineEntryId: options.pipeTimelineEntryId ?? null,
        title,
        startAt: options.startAtUnix,
        endAt: options.endAtUnix,
        addGoogleMeet: createPayload.addGoogleMeet,
        visioLink: createPayload.visioLink,
      });
    }
  } catch (e) {
    return {
      synced: false,
      reason: "error",
      message: e instanceof Error ? e.message : String(e),
    };
  }

  return { synced: true, clientAlreadyAccepted: false };
}

export async function planifyPipeRdv(options: {
  pipe: Pick<
    PipeRecord,
    "id" | "stage" | "pipe_type" | "contact_id" | "contact_prenom" | "contact_nom" | "titre"
  >;
  rdvStage: PipeRdvStage;
  startAtUnix: number;
  endAtUnix: number;
  contenu?: string | null;
  alerteId?: number | null;
  tacheId?: number | null;
  visio?: RdvVisioOptions;
  calendarTitle?: string | null;
}): Promise<{ calendar?: PipeRdvCalendarSyncResult }> {
  const contactLabel = formatPipeRdvCalendarContactLabel(options.pipe);

  const entry = await createPipeTimelineEntry({
    pipe_id: options.pipe.id,
    entry_type: "RDV",
    titre: formatRdvEntryTitle(options.rdvStage),
    contenu: options.contenu?.trim() || null,
    occurred_at: options.startAtUnix,
  });

  const [, calendar] = await Promise.all([
    applyRdvStageOnSave({
      pipe: options.pipe,
      rdvStage: options.rdvStage,
      occurredAt: options.startAtUnix,
      notes: options.contenu?.trim() || null,
    }),
    syncGoogleCalendarForPipeRdv({
      contactId: options.pipe.contact_id,
      contactLabel,
      rdvStage: options.rdvStage,
      startAtUnix: options.startAtUnix,
      endAtUnix: options.endAtUnix,
      pipeTimelineEntryId: entry.id,
      visio: options.visio,
      calendarTitle: options.calendarTitle,
    }),
  ]);

  return { calendar };
}

export async function planifyStandaloneGoogleRdv(options: {
  contactId: number;
  contactLabel: string;
  title: string;
  startAtUnix: number;
  endAtUnix: number;
  alerteId?: number | null;
  tacheId?: number | null;
  visio?: RdvVisioOptions;
}): Promise<void> {
  const visioPayload = rdvVisioToApiPayload(options.visio ?? { mode: "none" });
  await createCalendarRdv({
    contactId: options.contactId,
    alerteId: options.alerteId,
    tacheId: options.tacheId,
    title: options.title.trim() || `RDV — ${options.contactLabel}`,
    startAt: options.startAtUnix,
    endAt: options.endAtUnix,
    addGoogleMeet: visioPayload.addGoogleMeet,
    visioLink: visioPayload.visioLink,
  });
}

export async function cancelLinkedGoogleRdv(googleEventId: string | null | undefined): Promise<void> {
  if (!googleEventId?.trim()) return;
  try {
    const status = await getEmailConnectionStatus();
    if (!status.google_calendar_connected) return;
    await cancelCalendarRdv(googleEventId);
  } catch {
    /* best effort */
  }
}
