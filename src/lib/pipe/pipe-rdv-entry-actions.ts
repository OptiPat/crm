import type { PipeRecord } from "@/lib/api/tauri-pipe";
import type { usePipeTimeline } from "@/hooks/usePipeTimeline";
import { PIPE_STAGE_LABELS } from "@/lib/pipe/pipe-types";
import type { PipeTimelineUserType } from "@/lib/pipe/pipe-timeline-types";
import {
  syncPipeRdvToGoogleCalendarIfConnected,
  type PipeRdvCalendarSyncResult,
} from "@/lib/pipe/pipe-rdv-google-calendar";
import {
  applyRdvStageOnSave,
  formatRdvEntryTitle,
  type PipeRdvStage,
} from "@/lib/pipe/pipe-rdv-stage";
import { toast } from "sonner";

export type PipeRdvStageSaveResult = {
  advanced: boolean;
  scheduledDateLabel?: string;
  calendar?: PipeRdvCalendarSyncResult;
};

export async function addPipeTimelineEntryWithRdvStage(options: {
  timeline: ReturnType<typeof usePipeTimeline>;
  pipe?: Pick<PipeRecord, "id" | "stage" | "pipe_type"> | null;
  /** Contact de l'affaire — utilisé pour Google Agenda si connecté. */
  calendar?: {
    contactId: number;
    contactLabel: string;
    pipeTitre?: string | null;
  };
  entryType: PipeTimelineUserType;
  rdvStage?: PipeRdvStage;
  titre: string;
  contenu: string | null;
  occurredAtUnix: number;
}): Promise<PipeRdvStageSaveResult | null> {
  const titre =
    options.entryType === "RDV" && options.rdvStage
      ? formatRdvEntryTitle(options.rdvStage)
      : options.titre;

  await options.timeline.addEntry({
    entry_type: options.entryType,
    titre,
    contenu: options.contenu,
    occurred_at: options.occurredAtUnix,
  });

  if (options.entryType !== "RDV" || !options.rdvStage || !options.pipe) {
    return null;
  }

  const stageResult = await applyRdvStageOnSave({
    pipe: options.pipe,
    rdvStage: options.rdvStage,
    occurredAt: options.occurredAtUnix,
    notes: options.contenu,
  });

  const calendar = options.calendar
    ? await syncPipeRdvToGoogleCalendarIfConnected({
        contactId: options.calendar.contactId,
        contactLabel: options.calendar.contactLabel,
        pipeTitre: options.calendar.pipeTitre,
        rdvStage: options.rdvStage,
        startAtUnix: options.occurredAtUnix,
      })
    : undefined;

  return { ...stageResult, calendar };
}

function notifyGoogleCalendarSync(calendar?: PipeRdvCalendarSyncResult): void {
  if (!calendar) return;
  if (calendar.synced) {
    toast.success("RDV planifié dans Google Agenda");
    return;
  }
  if (calendar.reason === "error") {
    toast.warning(
      calendar.message.includes("connexion") || calendar.message.includes("Connectez")
        ? calendar.message
        : `Google Agenda : ${calendar.message}`
    );
  }
}

export function toastAfterRdvSave(
  rdvStage: PipeRdvStage,
  result: PipeRdvStageSaveResult | null,
  fallbackSuccess = "RDV ajouté"
) {
  if (!result) {
    toast.success(fallbackSuccess);
    return;
  }
  if (result.advanced) {
    toast.success(`RDV enregistré — avancement : ${PIPE_STAGE_LABELS[rdvStage]}`);
    notifyGoogleCalendarSync(result.calendar);
    return;
  }
  if (result.scheduledDateLabel) {
    toast.success(
      `RDV planifié. Passage en ${PIPE_STAGE_LABELS[rdvStage]} le ${result.scheduledDateLabel}.`
    );
    notifyGoogleCalendarSync(result.calendar);
    return;
  }
  toast.success(fallbackSuccess);
  notifyGoogleCalendarSync(result.calendar);
}
