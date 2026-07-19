import {
  defaultRdvDurationPresetForPlanOption,
  endUnixFromDuration,
  rdvDurationMinutesFromPreset,
} from "@/lib/calendar/rdv-duration";
import { getPipeRdvCalendarEventForTimeline } from "@/lib/api/tauri-calendar";
import {
  rdvStageFromPlanOption,
  type PipeRdvPlanOption,
} from "@/lib/pipe/pipe-rdv-plan-option";
import type { PipeRdvStage } from "@/lib/pipe/pipe-rdv-stage";
import type { PipeRecordLike } from "@/lib/pipe/pipe-types";

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

export function formatPipeRdvGoogleCalendarTitleFromPlanOption(
  planOption: PipeRdvPlanOption,
  contactLabel: string
): string {
  const contact = contactLabel.trim() || "Contact";
  if (planOption === "R2_PLACEMENT") {
    return `Présentation préconisations - ${contact}`;
  }
  if (planOption === "R2_IMMO") {
    return `Présentation préconisations - ${contact}`;
  }
  if (planOption === "R3_PLACEMENT") {
    return `Concrétisation placements - ${contact}`;
  }
  if (planOption === "R3_IMMO") {
    return `Concrétisation immo - ${contact}`;
  }
  return formatPipeRdvGoogleCalendarTitle(rdvStageFromPlanOption(planOption), contactLabel);
}

export function pipeRdvCalendarEndAt(startAtUnix: number): number {
  return startAtUnix + PIPE_RDV_CALENDAR_DURATION_SEC;
}

export function pipeRdvCalendarEndAtForPlanOption(
  startAtUnix: number,
  planOption?: PipeRdvPlanOption | null
): number {
  if (!planOption) {
    return pipeRdvCalendarEndAt(startAtUnix);
  }
  const minutes = rdvDurationMinutesFromPreset(
    defaultRdvDurationPresetForPlanOption(planOption)
  );
  return endUnixFromDuration(startAtUnix, minutes);
}

/** Fin agenda : conserve la durée déjà enregistrée, sinon défaut du type de RDV. */
export function resolvePipeRdvCalendarEndAtFromSnapshot(options: {
  startAtUnix: number;
  calendarEndAt?: number | null;
  planOption?: PipeRdvPlanOption | null;
}): number {
  if (options.calendarEndAt != null && options.calendarEndAt > options.startAtUnix) {
    return options.calendarEndAt;
  }
  return pipeRdvCalendarEndAtForPlanOption(options.startAtUnix, options.planOption);
}

export async function resolvePipeRdvCalendarEndAtForTimelineEntry(options: {
  startAtUnix: number;
  pipeTimelineEntryId: number;
  planOption?: PipeRdvPlanOption | null;
}): Promise<number> {
  const calendar = await getPipeRdvCalendarEventForTimeline(options.pipeTimelineEntryId).catch(
    () => null
  );
  return resolvePipeRdvCalendarEndAtFromSnapshot({
    startAtUnix: options.startAtUnix,
    calendarEndAt: calendar?.end_at,
    planOption: options.planOption,
  });
}
