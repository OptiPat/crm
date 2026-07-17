import type {
  PipeR1ChecklistItemState,
  PipeR1ChecklistItems,
  PipeR1DocumentChecklist,
} from "@/lib/api/tauri-pipe-r1-checklist";
import type { PipeTimelineEntryRecord } from "@/lib/api/tauri-pipe-timeline";
import {
  getActivePipeChecklistTemplateItems,
  type PipeChecklistTemplateItem,
  type PipeChecklistTemplates,
  type R1ChecklistProfile,
} from "@/lib/pipe/pipe-checklist-template";
import { phaseHasRdvActivityForStage } from "@/lib/pipe/pipe-rdv-delete";

export type { R1ChecklistProfile } from "@/lib/pipe/pipe-checklist-template";

export function checklistProfileFromRecord(
  checklist: Pick<
    PipeR1DocumentChecklist,
    "profile_salarie" | "profile_chef_entreprise" | "profile_retraite"
  >
): R1ChecklistProfile {
  return {
    salarie: checklist.profile_salarie,
    chef_entreprise: checklist.profile_chef_entreprise,
    retraite: checklist.profile_retraite,
  };
}

export function getChecklistItemState(
  items: PipeR1ChecklistItems,
  itemId: string
): PipeR1ChecklistItemState {
  return items[itemId] ?? { received: false };
}

export function isR1ChecklistItemComplete(
  templateItem: Pick<PipeChecklistTemplateItem, "noCreditOption">,
  item: PipeR1ChecklistItemState
): boolean {
  if (templateItem.noCreditOption) {
    return item.received || item.no_credit === true;
  }
  return item.received;
}

export function getActiveR1ChecklistItems(
  templates: PipeChecklistTemplates,
  profile: R1ChecklistProfile
): PipeChecklistTemplateItem[] {
  return getActivePipeChecklistTemplateItems("R1", templates, profile);
}

export function countR1ChecklistProgress(
  checklist: PipeR1DocumentChecklist,
  templates: PipeChecklistTemplates
): { received: number; total: number } {
  const profile = checklistProfileFromRecord(checklist);
  const definitions = getActiveR1ChecklistItems(templates, profile);
  const total = definitions.length;
  const received = definitions.filter((def) =>
    isR1ChecklistItemComplete(def, getChecklistItemState(checklist.items, def.id))
  ).length;
  return { received, total };
}

export function listMissingR1ChecklistKeys(
  checklist: PipeR1DocumentChecklist,
  templates: PipeChecklistTemplates
): string[] {
  const profile = checklistProfileFromRecord(checklist);
  return getActiveR1ChecklistItems(templates, profile)
    .filter(
      (def) =>
        !isR1ChecklistItemComplete(def, getChecklistItemState(checklist.items, def.id))
    )
    .map((def) => def.id);
}

export function listMissingR1ChecklistLabels(
  checklist: PipeR1DocumentChecklist,
  templates: PipeChecklistTemplates
): string[] {
  const profile = checklistProfileFromRecord(checklist);
  return getActiveR1ChecklistItems(templates, profile)
    .filter(
      (def) =>
        !isR1ChecklistItemComplete(def, getChecklistItemState(checklist.items, def.id))
    )
    .map((def) => def.label);
}

export function isR1ChecklistPastStage(stage: string): boolean {
  return stage === "R2" || stage === "R3" || stage === "GAGNEE" || stage === "PERDUE_OU_EN_ATTENTE";
}

/** Checklist visible dès qu'un RDV R1 est planifié (y compris en prospection). */
export function shouldShowR1DocumentChecklist(
  entries: PipeTimelineEntryRecord[]
): boolean {
  return phaseHasRdvActivityForStage(entries, "R1");
}

export function defaultR1ChecklistItems(): PipeR1ChecklistItems {
  return {};
}
