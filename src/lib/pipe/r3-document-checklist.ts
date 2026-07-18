import type {
  PipeR3ChecklistItemState,
  PipeR3ChecklistItems,
  PipeR3DocumentChecklist,
} from "@/lib/api/tauri-pipe-r3-checklist";
import type { PipeTimelineEntryRecord } from "@/lib/api/tauri-pipe-timeline";
import {
  getActivePipeChecklistTemplateItems,
  type PipeChecklistTemplateItem,
  type PipeChecklistTemplates,
} from "@/lib/pipe/pipe-checklist-template";
import { parseRdvTimelineTraceNote, rdvPlanOptionFromTraceNote } from "@/lib/pipe/pipe-rdv-delete";
import {
  isR3PlacementsRdvEntryTitre,
  isR3PlacementsRdvPlanOption,
} from "@/lib/pipe/pipe-rdv-plan-option";

const R3_EMPTY_PROFILE = {
  salarie: false,
  chef_entreprise: false,
  retraite: false,
} as const;

export function getChecklistItemState(
  items: PipeR3ChecklistItems,
  itemId: string
): PipeR3ChecklistItemState {
  return items[itemId] ?? { received: false };
}

export function isR3ChecklistItemComplete(item: PipeR3ChecklistItemState): boolean {
  return item.received;
}

export function getActiveR3ChecklistItems(
  templates: PipeChecklistTemplates
): PipeChecklistTemplateItem[] {
  return getActivePipeChecklistTemplateItems("R3", templates, R3_EMPTY_PROFILE);
}

export function countR3ChecklistProgress(
  checklist: PipeR3DocumentChecklist,
  templates: PipeChecklistTemplates
): { received: number; total: number } {
  const definitions = getActiveR3ChecklistItems(templates);
  return countR3ItemsProgress(checklist, definitions);
}

export function countR3ItemsProgress(
  checklist: PipeR3DocumentChecklist,
  items: readonly PipeChecklistTemplateItem[]
): { received: number; total: number } {
  const total = items.length;
  const received = items.filter((def) =>
    isR3ChecklistItemComplete(getChecklistItemState(checklist.items, def.id))
  ).length;
  return { received, total };
}

export function listMissingR3ChecklistKeys(
  checklist: PipeR3DocumentChecklist,
  templates: PipeChecklistTemplates
): string[] {
  return getActiveR3ChecklistItems(templates)
    .filter(
      (def) =>
        !isR3ChecklistItemComplete(getChecklistItemState(checklist.items, def.id))
    )
    .map((def) => def.id);
}

export function listMissingR3ChecklistLabels(
  checklist: PipeR3DocumentChecklist,
  templates: PipeChecklistTemplates
): string[] {
  return getActiveR3ChecklistItems(templates)
    .filter(
      (def) =>
        !isR3ChecklistItemComplete(getChecklistItemState(checklist.items, def.id))
    )
    .map((def) => def.label);
}

export function isR3ChecklistPastStage(stage: string): boolean {
  return stage === "GAGNEE" || stage === "PERDUE_OU_EN_ATTENTE";
}

/** Checklist placements visible pour RDV R3 générique ou R3 Placements (pas R3 Immo). */
export function shouldShowR3DocumentChecklist(
  entries: PipeTimelineEntryRecord[]
): boolean {
  return entries.some((entry) => {
    if (entry.entry_type === "RDV") {
      return isR3PlacementsRdvEntryTitre(entry.titre);
    }
    const trace = parseRdvTimelineTraceNote(entry.contenu);
    if (!trace || trace.kind !== "rescheduled") return false;
    const planOption = rdvPlanOptionFromTraceNote(entry.contenu);
    return planOption != null && isR3PlacementsRdvPlanOption(planOption);
  });
}

export function defaultR3ChecklistItems(): PipeR3ChecklistItems {
  return {};
}
