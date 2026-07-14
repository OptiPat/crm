import {
  createPlacementOperation,
  notifyPlacementOperationsChanged,
  type PlacementOperationType,
} from "@/lib/api/tauri-box-placement";
import { listPipeTimelineEntries } from "@/lib/api/tauri-pipe-timeline";
import { getPipeById, type PipeRecord } from "@/lib/api/tauri-pipe";
import type { usePipeTimeline } from "@/hooks/usePipeTimeline";
import {
  PLACEMENT_PARTENAIRE_TIMELINE_ENTRY_TYPE,
  placementOperationTypeForPartenaireJournal,
} from "@/lib/placement/pipe-placement-partenaire-types";
import { datetimeLocalToUnix, unixToDatetimeLocalInput } from "@/lib/pipe/pipe-timeline-types";

export async function createPlacementFromPipeJournal(options: {
  contactId: number;
  pipeId: number;
  pipeTimelineEntryId: number;
  operationType: PlacementOperationType | string;
}): Promise<void> {
  await createPlacementOperation({
    contact_id: options.contactId,
    pipe_id: options.pipeId,
    pipe_timeline_entry_id: options.pipeTimelineEntryId,
    operation_type: options.operationType,
  });
  notifyPlacementOperationsChanged();
}

/** Versement auto uniquement si l'affaire enfant est rattachée à un Suivi (pas à une autre affaire). */
export function shouldTrackVersementAffaireOnPipeCreate(
  pipe: Pick<PipeRecord, "pipe_type" | "parent_pipe_id" | "contact_id">,
  parentPipeType: string | null | undefined
): boolean {
  return (
    pipe.pipe_type === "AFFAIRE" &&
    pipe.parent_pipe_id != null &&
    pipe.parent_pipe_id > 0 &&
    pipe.contact_id > 0 &&
    parentPipeType === "ACTE_GESTION"
  );
}

/** Affaire versement enfant du Suivi : suivi VERSEMENT dès la création (entrée CREATION). */
export async function trackVersementAffaireOnPipeCreate(pipe: PipeRecord): Promise<void> {
  if (!pipe.parent_pipe_id || pipe.parent_pipe_id <= 0) return;
  const parent = await getPipeById(pipe.parent_pipe_id);
  if (!shouldTrackVersementAffaireOnPipeCreate(pipe, parent.pipe_type)) {
    return;
  }
  const entries = await listPipeTimelineEntries(pipe.id);
  const creation = entries.find((e) => e.entry_type === "CREATION");
  if (!creation) return;
  await createPlacementFromPipeJournal({
    contactId: pipe.contact_id,
    pipeId: pipe.id,
    pipeTimelineEntryId: creation.id,
    operationType: "VERSEMENT",
  });
}

export async function journalAffairePartenairePlacement(options: {
  timeline: ReturnType<typeof usePipeTimeline>;
  pipe: Pick<PipeRecord, "id" | "contact_id">;
  journalEntryType: keyof typeof PLACEMENT_PARTENAIRE_TIMELINE_ENTRY_TYPE;
  contenu?: string | null;
}): Promise<void> {
  if (options.pipe.contact_id <= 0) {
    throw new Error("Contact requis pour le suivi partenaire");
  }
  const entryType = PLACEMENT_PARTENAIRE_TIMELINE_ENTRY_TYPE[options.journalEntryType];
  const operationType = placementOperationTypeForPartenaireJournal(options.journalEntryType);
  const occurredAtUnix = datetimeLocalToUnix(unixToDatetimeLocalInput());
  const entry = await options.timeline.addEntry({
    entry_type: entryType,
    titre: options.journalEntryType === "VERSEMENT" ? "Versement partenaire" : "Souscription partenaire",
    contenu: options.contenu?.trim() || null,
    occurred_at: occurredAtUnix,
  });
  await createPlacementFromPipeJournal({
    contactId: options.pipe.contact_id,
    pipeId: options.pipe.id,
    pipeTimelineEntryId: entry.id,
    operationType,
  });
}
