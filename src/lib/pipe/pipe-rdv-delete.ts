import type { PipeTimelineEntryRecord } from "@/lib/api/tauri-pipe-timeline";
import {
  formatRdvEntryDisplayLabel,
  rdvStageFromEntryTitre,
  type PipeRdvStage,
} from "@/lib/pipe/pipe-rdv-stage";
import { getLinearStageIndex, isPipeStage, type PipeStage } from "@/lib/pipe/pipe-types";

export function listRdvEntriesForStage(
  entries: PipeTimelineEntryRecord[],
  rdvStage: PipeRdvStage,
  excludeEntryId?: number
): PipeTimelineEntryRecord[] {
  return entries.filter((e) => {
    if (e.entry_type !== "RDV") return false;
    if (excludeEntryId != null && e.id === excludeEntryId) return false;
    return rdvStageFromEntryTitre(e.titre) === rdvStage;
  });
}

export function isLastRdvForStage(
  entry: PipeTimelineEntryRecord,
  entries: PipeTimelineEntryRecord[]
): boolean {
  if (entry.entry_type !== "RDV") return false;
  const rdvStage = rdvStageFromEntryTitre(entry.titre);
  if (!rdvStage) return false;
  return listRdvEntriesForStage(entries, rdvStage, entry.id).length === 0;
}

export function canRevertPipeToProspection(pipeStage: string): boolean {
  if (!isPipeStage(pipeStage)) return false;
  const idx = getLinearStageIndex(pipeStage);
  const r1Idx = getLinearStageIndex("R1");
  const r3Idx = getLinearStageIndex("R3");
  return idx >= r1Idx && idx <= r3Idx;
}

export function shouldHighlightRevertToProspection(
  entry: PipeTimelineEntryRecord,
  entries: PipeTimelineEntryRecord[],
  pipeStage: string
): boolean {
  if (!canRevertPipeToProspection(pipeStage)) return false;
  return isLastRdvForStage(entry, entries);
}

export function buildRdvCancelledTimelinePayload(
  entry: Pick<PipeTimelineEntryRecord, "entry_type" | "titre">,
  userNote?: string | null
): { titre: string | null; contenu: string | null } {
  const label = formatRdvEntryDisplayLabel(entry) ?? "RDV";
  const trimmed = userNote?.trim();
  if (trimmed) {
    return { titre: null, contenu: `${label} annulé : ${trimmed}` };
  }
  return { titre: null, contenu: `${label} annulé` };
}

/** Notes pour le jalon d'étape (retour prospection). */
export function formatRdvCancellationStageNotes(
  entry: Pick<PipeTimelineEntryRecord, "entry_type" | "titre">,
  userNote?: string | null
): string | null {
  const { contenu } = buildRdvCancelledTimelinePayload(entry, userNote);
  return contenu?.trim() || null;
}

export function milestoneStageExpectsRdv(stage: PipeStage | null): stage is PipeRdvStage {
  return stage === "R1" || stage === "R2" || stage === "R3";
}

export function phaseEntriesHaveRdv(phaseEntries: PipeTimelineEntryRecord[]): boolean {
  return phaseEntries.some((e) => e.entry_type === "RDV");
}
