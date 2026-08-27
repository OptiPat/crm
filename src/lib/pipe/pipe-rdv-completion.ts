import {
  defaultRdvDurationPresetForPlanOption,
  rdvDurationMinutesFromPreset,
} from "@/lib/calendar/rdv-duration";
import type { PipeTimelineEntryRecord } from "@/lib/api/tauri-pipe-timeline";
import {
  rdvPlanOptionFromEntryTitre,
  rdvStageFromPlanOption,
} from "@/lib/pipe/pipe-rdv-plan-option";
import type { PipeRdvStage } from "@/lib/pipe/pipe-rdv-stage";

const FALLBACK_RDV_DURATION_SEC = 60 * 60;

/** Fin de créneau : durée par défaut du type de RDV (R1 / R2 Immo / R3 Immo = 90 min). */
export function rdvTimelineEntryEndAtUnix(
  occurredAtUnix: number,
  titre?: string | null
): number {
  const plan = rdvPlanOptionFromEntryTitre(titre);
  if (!plan) return occurredAtUnix + FALLBACK_RDV_DURATION_SEC;
  const minutes = rdvDurationMinutesFromPreset(defaultRdvDurationPresetForPlanOption(plan));
  return occurredAtUnix + minutes * 60;
}

/** RDV commercial terminé (fin de créneau agenda selon le titre). */
export function isRdvTimelineEntryCompleted(
  entry: Pick<PipeTimelineEntryRecord, "entry_type" | "titre" | "occurred_at">,
  now: Date = new Date()
): boolean {
  if (entry.entry_type !== "RDV") return false;
  if (!rdvPlanOptionFromEntryTitre(entry.titre)) return false;
  const nowUnix = Math.floor(now.getTime() / 1000);
  return rdvTimelineEntryEndAtUnix(entry.occurred_at, entry.titre) <= nowUnix;
}

export function latestRdvEntryForStage(
  entries: PipeTimelineEntryRecord[],
  rdvStage: PipeRdvStage
): PipeTimelineEntryRecord | null {
  let best: PipeTimelineEntryRecord | null = null;
  for (const entry of entries) {
    if (entry.entry_type !== "RDV") continue;
    const plan = rdvPlanOptionFromEntryTitre(entry.titre);
    if (!plan || rdvStageFromPlanOption(plan) !== rdvStage) continue;
    if (!best || entry.occurred_at > best.occurred_at) best = entry;
  }
  return best;
}
