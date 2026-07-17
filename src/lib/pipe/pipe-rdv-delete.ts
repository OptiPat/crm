import type { PipeTimelineEntryRecord } from "@/lib/api/tauri-pipe-timeline";
import {
  rdvPlanOptionFromEntryTitre,
  rdvStageFromPlanOption,
  type PipeRdvPlanOption,
} from "@/lib/pipe/pipe-rdv-plan-option";
import {
  formatRdvEntryDisplayLabel,
  formatRdvStageLabel,
  isPipeRdvStage,
  rdvStageFromEntryTitre,
  type PipeRdvStage,
} from "@/lib/pipe/pipe-rdv-stage";
import { formatTimelineOccurredAt } from "@/lib/pipe/pipe-timeline-types";
import {
  getPreviousLinearStage,
  isPipeStage,
  type PipeStage,
} from "@/lib/pipe/pipe-types";

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

/** Étape cible après annulation du dernier RDV de l'étape courante (ex. R2 → R1). */
export function resolveStageAfterRdvCancellation(
  pipeStage: string,
  cancelledEntry: PipeTimelineEntryRecord,
  entries: PipeTimelineEntryRecord[]
): PipeStage | null {
  if (!isPipeStage(pipeStage)) return null;
  const rdvStage = rdvStageFromEntryTitre(cancelledEntry.titre);
  if (!rdvStage || pipeStage !== rdvStage) return null;
  if (!isLastRdvForStage(cancelledEntry, entries)) return null;
  return getPreviousLinearStage(pipeStage);
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

function extractTitreFromTraceNoteText(text: string): string | null {
  const kindMatch = text.match(/ (annulé|reporté)(?:\s*[:—].*)?$/);
  if (!kindMatch) return null;
  const labelPart = text.slice(0, text.length - kindMatch[0].length).trim();
  let titreCandidate = labelPart.replace(/\s+planifié$/i, "").trim();
  if (titreCandidate.toUpperCase().startsWith("RDV ")) {
    titreCandidate = titreCandidate.slice(4).trim();
  }
  return titreCandidate || null;
}

/** Option de plan RDV encodée dans une note de trace annulation/report. */
export function rdvPlanOptionFromTraceNote(
  contenu: string | null | undefined
): PipeRdvPlanOption | null {
  const text = contenu?.trim() ?? "";
  if (!text) return null;
  const titreCandidate = extractTitreFromTraceNoteText(text);
  return titreCandidate ? rdvPlanOptionFromEntryTitre(titreCandidate) : null;
}

export function parseRdvTimelineTraceNote(
  contenu: string | null | undefined
): RdvTimelineTraceNote | null {
  const text = contenu?.trim() ?? "";
  const kindMatch = text.match(/ (annulé|reporté)(?:\s*[:—].*)?$/);
  if (kindMatch) {
    const kind = kindMatch[1] === "annulé" ? "cancelled" : "rescheduled";
    const planOption = rdvPlanOptionFromTraceNote(text);
    if (planOption) {
      return { stage: rdvStageFromPlanOption(planOption), kind };
    }
  }

  const match = text.match(/^(?:RDV )?(R[123])(?: planifié)? (annulé|reporté)/);
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
  const label = `${formatRdvStageLabel(trace.stage)} planifié`;
  return trace.kind === "cancelled" ? `${label} · Annulé` : `${label} · Reporté`;
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

/** Notes pour le jalon d'étape après annulation RDV. */
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
