import type { PipeTimelineEntryRecord } from "@/lib/api/tauri-pipe-timeline";
import {
  formatRdvEntryDisplayLabel,
  formatRdvStageLabel,
  isPipeRdvStage,
  rdvStageFromEntryTitre,
  type PipeRdvStage,
} from "@/lib/pipe/pipe-rdv-stage";
import { formatTimelineOccurredAt } from "@/lib/pipe/pipe-timeline-types";
import { getLinearStageIndex, isPipeStage, type PipeStage } from "@/lib/pipe/pipe-types";

export type RdvTimelineTraceKind = "cancelled" | "rescheduled";

export interface RdvTimelineTraceNote {
  stage: PipeRdvStage;
  kind: RdvTimelineTraceKind;
}

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

export function buildRdvRescheduledTimelinePayload(
  entry: Pick<PipeTimelineEntryRecord, "entry_type" | "titre">,
  previousOccurredAt: number,
  newOccurredAt: number,
  userNote?: string | null
): { titre: string | null; contenu: string | null } {
  const label = formatRdvEntryDisplayLabel(entry) ?? "RDV";
  const from = formatTimelineOccurredAt(previousOccurredAt);
  const to = formatTimelineOccurredAt(newOccurredAt);
  const base = `${label} reporté : était le ${from} → ${to}`;
  const trimmed = userNote?.trim();
  if (trimmed) {
    return { titre: null, contenu: `${base} — ${trimmed}` };
  }
  return { titre: null, contenu: base };
}

export function parseRdvTimelineTraceNote(
  contenu: string | null | undefined
): RdvTimelineTraceNote | null {
  const text = contenu?.trim() ?? "";
  const match = text.match(/^RDV (R[123]) (annulé|reporté)/);
  if (!match) return null;
  const stage = match[1];
  if (!isPipeRdvStage(stage)) return null;
  return {
    stage,
    kind: match[2] === "annulé" ? "cancelled" : "rescheduled",
  };
}

export function isRdvTimelineTraceNote(entry: PipeTimelineEntryRecord): boolean {
  return entry.entry_type === "NOTE" && parseRdvTimelineTraceNote(entry.contenu) != null;
}

export function stageHasRdvCancellationTrace(
  entries: PipeTimelineEntryRecord[],
  milestoneStage: PipeRdvStage
): boolean {
  return entries.some((entry) => {
    const trace = parseRdvTimelineTraceNote(entry.contenu);
    return trace?.stage === milestoneStage && trace.kind === "cancelled";
  });
}

/** Reprendre un RDV depuis une trace d'annulation (aucun RDV actif pour l'étape). */
export function canResumeRdvFromCancelledTrace(
  trace: RdvTimelineTraceNote | null,
  allEntries: PipeTimelineEntryRecord[],
  pipeType: string
): boolean {
  if (pipeType !== "AFFAIRE") return false;
  if (!trace || trace.kind !== "cancelled") return false;
  return listRdvEntriesForStage(allEntries, trace.stage).length === 0;
}

export function formatRdvTimelineTraceBadge(contenu: string | null | undefined): string | null {
  const trace = parseRdvTimelineTraceNote(contenu);
  if (!trace) return null;
  const label = formatRdvStageLabel(trace.stage);
  return trace.kind === "cancelled" ? `RDV ${label} · Annulé` : `RDV ${label} · Reporté`;
}

export function phaseHasRdvActivityForStage(
  phaseEntries: PipeTimelineEntryRecord[],
  milestoneStage: PipeRdvStage
): boolean {
  return phaseEntries.some((entry) => {
    if (entry.entry_type === "RDV") {
      return rdvStageFromEntryTitre(entry.titre) === milestoneStage;
    }
    const trace = parseRdvTimelineTraceNote(entry.contenu);
    return trace?.stage === milestoneStage && trace.kind === "rescheduled";
  });
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
